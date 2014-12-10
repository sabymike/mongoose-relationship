"use strict";

var _ = require("underscore");
var async = require('async');

var defaults = {
    relationshipPathName: "relationship",
    triggerMiddleware: false
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
        var relationshipPath = schema.paths[relationshipPathName];
        if (!relationshipPath) {
            throw new Error("No relationship path defined");
        }
        var validationError = validatePath(relationshipPath);
        if (validationError) {
            throw validationError;
        } else {
            var opts = optionsForRelationship(relationshipPath);
            if (opts.validateExistence) {
                if (_.isFunction(relationshipPath.options.type)) {
                    schema.path(relationshipPathName).validate(function(value, response) {
                        var relationshipTargetModel = this.db.model(opts.ref);
                        relationshipTargetModel.findById(value, function(err, result) {
                            if (err || !result) {
                                response(false);
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
                            // check if there is an error, if the result didn't return anything,
                            // or we didn't find the same amount of entities as the set value
                            //expects us to
                            if ((err || !result) ||
                                (result && result.length !== value.length)) {
                                response(false);
                            } else {
                                response(true);
                            }
                        });
                    }, "Relationship entity " + opts.ref + " does not exist");
                }
            }
        }
    });

    schema.pre('save', true, function(next, done) {
        var self = this;
        next();
        async.each(
            relationshipPaths,
            function(path, callback) {
                if (self.isModified(path)) {
                    self.updateCollectionForRelationship(path, 'add', callback);
                } else {
                    callback();
                }
            },
            function(err) {
                done(err);
            });

    });

    schema.pre('remove', true, function(next, done) {
        var self = this;
        next();
        async.each(
            relationshipPaths,
            function(path, callback) {
                self.updateCollectionForRelationship(path, 'remove', callback);
            },
            function(err) {
                done(err);
            });
    });

    schema.method('updateCollectionForRelationship', function(relationshipPathName, updateAction, done) {
        // the parent value is not set, do not try to associated it with the
        //defined relationship
        if (!this.get(relationshipPathName)) {
            return done();
        }

        var relationshipPathOptions = optionsForRelationship(this.schema.paths[relationshipPathName]);
        var childPath = relationshipPathOptions.childPath;
        var relationshipTargetModel = this.db.model(relationshipPathOptions.ref);
        if (relationshipTargetModel && relationshipTargetModel.schema.paths[childPath]) {
            var relationshipTargetModelPath = relationshipTargetModel.schema.paths[childPath];
            var relationshipTargetType = relationshipTargetModelPath.options.type;

            var updateBehavior = {};
            var updateRule = {};
            updateRule[childPath] = this._id;
            // one-one
            if (_.isFunction(relationshipTargetType)) {
                if (updateAction === 'add') {
                    updateBehavior.$set = updateRule;
                } else if (updateAction === 'remove') {
                    updateBehavior.$unset = updateRule;
                }
            }
            // one-many and many-many
            else if (_.isObject(relationshipTargetType)) {
                if (updateAction === 'add') {
                    updateBehavior.$addToSet = updateRule;
                } else if (updateAction === 'remove') {
                    updateBehavior.$pull = updateRule;
                }
            }

            if (!_.isEmpty(updateBehavior)) {
                var pathValue = this.get(relationshipPathName);
                if (!_.isArray(pathValue)) {
                    pathValue = [pathValue];
                }

                if (pathValue.length === 0) {
                    return updateRemovedParents(this._id, relationshipTargetModel, childPath, pathValue, done);
                }

                var self = this;
                var filterOpts = {
                    _id: {
                        $in: pathValue
                    }
                };
                relationshipTargetModel.update(
                    filterOpts,
                    updateBehavior, {
                        multi: true
                    },
                    function(err, result) {
                        if (err) {
                            done(err);
                        }

                        if (options.triggerMiddleware) {
                            relationshipTargetModel.find(filterOpts, function(err, results) {
                                if (err) {
                                    done(err);
                                } else {
                                    async.each(results, function(result, cb) {
                                        result.save(cb);
                                    }, function(err) {
                                        if (err) {
                                            done(err);
                                        } else {
                                            updateRemovedParents(self._id, relationshipTargetModel, childPath, pathValue, done);
                                        }
                                    });
                                }
                            });
                        } else {
                            updateRemovedParents(self._id, relationshipTargetModel, childPath, pathValue, done);
                        }
                    });
            } else {
                done();
            }
        } else {
            done();
        }
    });
};