"use strict";

var _ = require("lodash");
var async = require('async');

var defaults = {
    relationshipPathName: "relationship",
    triggerMiddleware: false
};

var operationMap = {
    func: {
        add: '$set',
        remove: '$unset'
    },
    obj: {
        add: '$addToSet',
        remove: '$pull'
    }
};

function optionsForRelationship(relationship) {
    var relationshipPathOptions;
    var relationshipRefType = relationship.options.type;
    // One-to-One or One-To-Many
    if (_.isFunction(relationshipRefType)) {
        relationshipPathOptions = relationship.options;
    }
    // Many-to-Many
    else if (_.isObject(relationshipRefType)) {
        relationshipPathOptions = relationship.options.type[0];
    }
    return relationshipPathOptions;
}

function validatePath(relationshipPath) {
    var relationshipPathOptions = optionsForRelationship(relationshipPath);
    if (!_.isUndefined(relationshipPathOptions)) {
        if (_.isUndefined(relationshipPathOptions.ref)) {
            return new Error("Relationship " + relationshipPath.path + " requires a ref");
        }

        if (_.isUndefined(relationshipPathOptions.childPath)) {
            return new Error("Relationship " + relationshipPath.path + " requires a childPath for its parent");
        }
    } else {
        return new Error("Mission options for relationship " + relationshipPath.path);
    }
}

function updateRemovedParents(id, relationshipTargetModel, childPath, pathValue, done) {
    // guarantee that no other elements has this one as child
    var query = {};
    if (pathValue && pathValue.length) {
        query._id = {
            $nin: pathValue
        };
    }

    query[childPath] = {
        $in: [id]
    };
    var updateVal = {
        $pull: {}
    };
    updateVal.$pull[childPath] = id;

    relationshipTargetModel.update(
        query,
        updateVal, {
            multi: true
        },
        function(err, result) {
            done(err);
        }
    );
}

module.exports = exports = function relationship(schema, options) {
    options = _.extend(defaults, options);

    var relationshipPaths = options.relationshipPathName;
    if (_.isString(relationshipPaths)) {
        relationshipPaths = [relationshipPaths];
    }

    _.each(relationshipPaths, function(relationshipPathName) {
        if (_.isString(relationshipPathName)) {
            var relationshipPath = schema.paths[relationshipPathName];
        } else if (_.isObject(relationshipPathName)) {
            var relationshipPath = relationshipPathName;
        }
        if (!relationshipPath) {
            throw new Error("No relationship path defined");
        }
        var validationError = validatePath(relationshipPath);
        if (validationError) {
            throw validationError;
        }

        var opts = optionsForRelationship(relationshipPath);
        if (opts.validateExistence || opts.upsert) {
            if (_.isFunction(relationshipPath.options.type)) {
                schema.path(relationshipPathName).validate(function(value, response) {
                    var relationshipTargetModel = this.db.model(opts.ref);
                    relationshipTargetModel.findById(value, function(err, result) {
                        if (err) {
                            response(false);
                        } else if (!result) {
                            if (opts.upsert) {
                                var targetModel = new relationshipTargetModel({
                                    _id: value
                                });

                                targetModel.save(function(err, model) {
                                    response(!err && model);
                                });
                            } else {
                                response(false);
                            }
                        } else {
                            response(true);
                        }
                    });
                }, "Relationship entity " + opts.ref + " does not exist");
            } else if (_.isObject(relationshipPath.options.type)) {
                schema.path(relationshipPathName).validate(function(value, response) {
                    var relationshipTargetModel = this.db.model(opts.ref);
                    relationshipTargetModel.find({
                        _id: {
                            $in: value
                        }
                    }, function(err, result) {
                        if (err || !result) {
                            response(false);
                        } else if (result.length !== value.length) {
                            if (opts.upsert) {
                                var existingModels = result.map(function(o) {
                                    return o._id.toString();
                                });
                                value = value.map(function(id) {
                                    return id.toString();
                                });
                                var modelsToCreate = _.difference(value, existingModels);
                                async.each(
                                    modelsToCreate,
                                    function(id, cb) {
                                        var mdl = new relationshipTargetModel({
                                            _id: id
                                        });

                                        mdl.save(cb);
                                    },
                                    function(err) {
                                        response(!err);
                                    }
                                );
                            } else {
                                response(false);
                            }
                        } else {
                            response(true);
                        }
                    });
                }, "Relationship entity " + opts.ref + " does not exist");
            }
        }
    });

    schema.pre('save', true, function(next, done) {
        var self = this;
        next();

        self.constructor.findById(self._id, function(err, oldModel) {
            async.each(
                relationshipPaths,
                function(path, callback) {
                    if (!self.isModified(path)) {
                        return callback();
                    }

                    var oldValue = oldModel ? oldModel.get(path) : undefined;
                    var newValue = self.get(path);

                    async.series([
                            function(cb) {
                                self.updateCollectionForRelationship(path, oldValue, 'remove', cb);
                            },
                            function(cb) {
                                self.updateCollectionForRelationship(path, newValue, 'add', cb);
                            }
                        ],
                        callback);
                }, done);
        });
    });

    schema.pre('remove', true, function(next, done) {
        var self = this;
        next();
        async.each(relationshipPaths,
            function(path, callback) {
                self.updateCollectionForRelationship(path, self.get(path), 'remove', callback);
            },
            done);
    });

    schema.method('updateCollectionForRelationship', function(relationshipPathName, relationshiptPathValue, updateAction, done) {
        var relationshipPathOptions = optionsForRelationship(this.schema.paths[relationshipPathName]);
        var childPath = relationshipPathOptions.childPath;
        var relationshipTargetModel = this.db.model(relationshipPathOptions.ref);

        if (!relationshiptPathValue || !relationshipTargetModel || !relationshipTargetModel.schema.paths[childPath]) {
            return done();
        }

        var relationshipTargetModelPath = relationshipTargetModel.schema.paths[childPath];
        var relationshipTargetType = relationshipTargetModelPath.options.type;

        var updateBehavior = {};
        var updateRule = {};
        updateRule[childPath] = this._id;

        // one-one
        if (_.isFunction(relationshipTargetType)) {
            updateBehavior[operationMap.func[updateAction]] = updateRule;
        }
        // one-many and many-many
        else if (_.isObject(relationshipTargetType)) {
            updateBehavior[operationMap.obj[updateAction]] = updateRule;
        }

        if (_.isEmpty(updateBehavior)) {
            return done();
        }

        if (!_.isArray(relationshiptPathValue)) {
            relationshiptPathValue = [relationshiptPathValue];
        }

        if (_.isEmpty(relationshiptPathValue)) {
            return updateRemovedParents(this._id, relationshipTargetModel, childPath, relationshiptPathValue, done);
        }

        var self = this;
        var filterOpts = {
            _id: {
                $in: relationshiptPathValue
            }
        };
        relationshipTargetModel.update(
            filterOpts,
            updateBehavior, {
                multi: true
            },
            function(err, result) {
                if (err) {
                    return done(err);
                }

                if (!options.triggerMiddleware) {
                    return updateRemovedParents(self._id, relationshipTargetModel, childPath, relationshiptPathValue, done);
                }

                relationshipTargetModel.find(filterOpts, function(err, results) {
                    if (err) {
                        return done(err);
                    }

                    async.each(results,
                        function(result, cb) {
                            result.markModified(childPath);
                            result.save(cb);
                        },
                        function(err) {
                            if (err) {
                                return done(err);
                            }
                            updateRemovedParents(self._id, relationshipTargetModel, childPath, relationshiptPathValue, done);
                        });
                });
            });
    });
};
