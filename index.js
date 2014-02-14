var _ = require("underscore");
var async = require('async');

var defaults = {
    relationshipPathName:"relationship",
};

function optionsForRelationship(relationship) {
    var relationshipPathOptions;
    var relationshipRefType = relationship.options.type;
    // One-to-One or One-To-Many
    if ( _.isFunction(relationshipRefType) )
    {
        relationshipPathOptions = relationship.options;
    }
    // Many-to-Many
    else if ( _.isObject(relationshipRefType) )
    {
        relationshipPathOptions = relationship.options.type[0];
    }
    return relationshipPathOptions;
}

function validatePath(relationshipPath) {
    var relationshipPathOptions = optionsForRelationship(relationshipPath);
    if ( !_.isUndefined(relationshipPathOptions) )
    {
        if ( _.isUndefined(relationshipPathOptions.ref) )
        {
            throw new Error("Relationship " + relationshipPath.path +  " requires a ref");
        }

        if ( _.isUndefined(relationshipPathOptions.childPath) )
        {
            throw new Error("Relationship " + relationshipPath.path +  " requires a childPath for its parent");
        }
    }
    else
    {
        throw new Error("Mission options for relationship " + relationshipPathName);
    }
}

module.exports = exports = function relationship(schema, options) {
    options = _.extend(defaults, options);

    var relationshipPaths = options.relationshipPathName;
    if ( _.isString(relationshipPaths) )
    {
        relationshipPaths = [relationshipPaths];
    }

    _.each(relationshipPaths, function(relationshipPathName) {
        var relationshipPath = schema.paths[relationshipPathName];
        if ( !relationshipPath )
        {
            throw new Error("No relationship path defined");
        }
        validatePath(relationshipPath);
    });

    schema.pre('save', function(done) {
        var self = this;
        async.each(
                relationshipPaths,
                function(path, callback) {
                    if ( self.isModified(path) )
                    {
                        self.updateCollectionForRelationship(path, 'add', callback);
                    }
                    else
                    {
                        callback();
                    }
                },
                function(err) {
                    done(err);
                });

    });

    schema.pre('remove', function(done) {
        var self = this;
        async.each(
            relationshipPaths,
            function(path, callback) {
                self.updateCollectionForRelationship(path, 'remove', done);
            },
            function(err) {
                done(err);
            });
    });

    schema.method('updateCollectionForRelationship', function(relationshipPathName, updateAction, done) {
        // the parent value is not set, do not try to associated it with the
        //defined relationship
        if ( !this.get(relationshipPathName) )
        {
            done();
        }

        var relationshipPathOptions = optionsForRelationship(this.schema.paths[relationshipPathName]);
        var childPath = relationshipPathOptions.childPath;
        var relationshipTargetModel = this.db.model(relationshipPathOptions.ref);
        if ( relationshipTargetModel && relationshipTargetModel.schema.paths[childPath] )
        {
            var relationshipTargetModelPath = relationshipTargetModel.schema.paths[childPath];
            var relationshipTargetType = relationshipTargetModelPath.options.type;

            var updateBehavior = {};
            var updateRule = {};
            updateRule[childPath] = this._id;
            // one-one
            if ( _.isFunction(relationshipTargetType) )
            {
                if ( updateAction == 'add' )
                {
                    updateBehavior['$set'] = updateRule;
                }
                else if ( updateAction == 'remove' )
                {
                    updateBehavior['$unset'] = updateRule;
                }
            }
            // one-many and many-many
            else if ( _.isObject(relationshipTargetType) )
            {
                if ( updateAction == 'add' )
                {
                    updateBehavior['$addToSet'] = updateRule;
                }
                else if ( updateAction == 'remove' )
                {
                    updateBehavior['$pull'] = updateRule;
                }
            }

            if ( !_.isEmpty(updateBehavior) )
            {
                var pathValue = this.get(relationshipPathName);
                if ( !_.isArray(pathValue) )
                {
                    pathValue = [pathValue];
                }

                relationshipTargetModel.update(
                    { _id : { $in : pathValue } },
                    updateBehavior,
                    { multi: true },
                    function(err, result) {
                        done(err);
                    });
            }
            else
            {
                done();
            }
        }
        else
        {
            done();
        }
    });
};