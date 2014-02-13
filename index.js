var _ = require("underscore");

var defaults = {
    relationshipPathName:"relationship",
};

module.exports = exports = function relationship(schema, options) {
    options = _.extend(defaults, options);

    var relationshipPathName = options.relationshipPathName;
    var relationshipPath = schema.paths[relationshipPathName];
    if ( !relationshipPath )
    {
        throw new Error("No relationship path defined");
    }

    var relationshipPathOptions;
    var relationshipRefType = relationshipPath.options.type;
    // One-to-One or One-To-Many
    if ( typeof relationshipRefType == 'function' )
    {
        relationshipPathOptions = relationshipPath.options;
    }
    // Many-to-Many
    else if ( typeof relationshipRefType == 'object' )
    {
        relationshipPathOptions = relationshipPath.options.type[0];
    }

    if ( _.isUndefined(relationshipPathOptions.ref) )
    {
        throw new Error("Relationship requires a ref");
    }

    if ( _.isUndefined(relationshipPathOptions.childPath) )
    {
        throw new Error("Relationship requires a childPath for its parent");
    }

    schema.pre('save', function(done) {
        if ( this.isModified(relationshipPathName) )
        {
            this.updateRelationshipCollection('add', done);
        }
        else
        {
            done();
        }
    });

    schema.pre('remove', function(done) {
        this.updateRelationshipCollection('remove', done);
    });

    schema.method('updateRelationshipCollection', function(updateAction, done) {
        // the parent value is not set, do not try to associated it with the
        //defined relationship
        if ( !this.get(relationshipPathName) )
        {
            done();
        }

        var childPath = relationshipPathOptions.childPath;
        var relationshipModel = this.db.model(relationshipPathOptions.ref);
        if ( relationshipModel && relationshipModel.schema.paths[childPath] )
        {
            var relationshipModelPath = relationshipModel.schema.paths[childPath];
            var relationshipType = relationshipModelPath.options.type;

            var updateBehavior = {};
            var updateRule = {};
            updateRule[childPath] = this._id;
            // one-one
            if ( typeof relationshipType == 'function' )
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
            else if ( typeof relationshipType == 'object' )
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
                if (  typeof relationshipRefType == 'function' )
                {
                    pathValue = [pathValue];
                }

                relationshipModel.update(
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