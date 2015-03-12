"use strict";

/* jshint expr:true */

var mongoose = require("mongoose"),
    should = require("should"),
    async = require("async"),
    relationship = require("..");
var Schema = mongoose.Schema;
var ObjectId = Schema.ObjectId;

mongoose.connect(process.env.MONGODB_URL || "mongodb://localhost:27017/mongoose-relationship");

describe("Schema Key Tests", function() {
    describe("Testing initialization", function() {

        var ChildSchema = new Schema({
            name: String,
        });

        it("should throw an error if the path is not present in the schema", function() {
            (function() {
                ChildSchema.plugin(relationship);
            }).should.throw('No relationship path defined');
        });

        it("should throw an error if a ref is not provided on the relationship path", function() {
            (function() {
                ChildSchema.add({
                    relation: ObjectId
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'relation',
                    triggerMiddleware: false
                });
            }).should.throw('Relationship relation requires a ref');
        });

        it("should thrown an error if the relationship path does not have a child collection option", function() {
            (function() {
                ChildSchema.add({
                    relation: {
                        type: ObjectId,
                        ref: 'ParentSchema'
                    }
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'relation',
                    triggerMiddleware: false
                });
            }).should.throw('Relationship relation requires a childPath for its parent');
        });

        it("should not throw an error if all the parameters are set correctly", function() {
            (function() {
                ChildSchema.add({
                    relation: {
                        type: ObjectId,
                        ref: 'ParentSchema',
                        childPath: "children"
                    }
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'relation',
                    triggerMiddleware: false
                });
            }).should.not.throw();
        });
    });

    describe("Testing Middleware Flag", function() {
        var Child, Parent;
        before(function() {
            var self = this;
            var ParentSchema = new Schema({
                child: {
                    type: ObjectId,
                    ref: "ChildMiddleware"
                }
            });
            ParentSchema.pre('save', function(next) {
                self.middlewareCalled = true;
                next();
            });
            Parent = mongoose.model("ParentMiddleware", ParentSchema);

            var ChildSchema = new Schema({
                parent: {
                    type: ObjectId,
                    ref: "ParentMiddleware",
                    childPath: "child"
                }
            });
            ChildSchema.plugin(relationship, {
                relationshipPathName: "parent",
                triggerMiddleware: true
            });
            Child = mongoose.model("ChildMiddleware", ChildSchema);
        });

        beforeEach(function(done) {
            this.middlewareCalled = false;
            this.parent = new Parent({});
            this.child = new Child({
                parent: this.parent._id
            });

            var self = this;
            this.parent.save(function(err, parent) {
                self.middlewareCalled = false;
                done(err);
            });
        });

        it("should trigger any parent save middleware when a relationship is updated", function(done) {
            var self = this;
            self.middlewareCalled.should.not.be.ok;
            this.child.save(function(err, child) {
                self.middlewareCalled.should.be.ok;
                done(err);
            });
        });
    });

    describe("Upsert", function() {
        describe('One-To-One', function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    child: {
                        type: ObjectId,
                        ref: 'ChildUpsertOneOne'
                    }
                });
                Parent = mongoose.model('ParentUpsertOneOne', ParentSchema);

                var ChildSchema = new Schema({
                    parent: {
                        type: ObjectId,
                        ref: 'ParentUpsertOneOne',
                        childPath: 'child',
                        upsert: true
                    }
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'parent',
                    triggerMiddleware: false
                });
                Child = mongoose.model('ChildUpsertOneOne', ChildSchema);
            });

            it('should create the parent if it does not exist when upsert == true', function(done) {
                var child = new Child({
                    parent: mongoose.Types.ObjectId()
                });

                child.save(function(err, child) {
                    should.not.exist(err);
                    Parent.findById(child.parent, function(err, parent) {
                        should.exist(parent);
                        done(err);
                    });
                });
            });
        });

        describe('One-To-Many', function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    child: {
                        type: ObjectId,
                        ref: 'ChildUpsertOneMany'
                    }
                });
                Parent = mongoose.model('ParentUpsertOneMany', ParentSchema);

                var ChildSchema = new Schema({
                    parents: [{
                        type: ObjectId,
                        ref: 'ParentUpsertOneMany',
                        childPath: 'child',
                        upsert: true
                    }]
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'parents',
                    triggerMiddleware: false
                });
                Child = mongoose.model('ChildUpsertOneMany', ChildSchema);
            });

            beforeEach(function(done) {
                this.parent = new Parent({});
                this.parent.save(done);
            });

            it('should create all the parents that do not exist', function(done) {
                var child = new Child({
                    parents: [this.parent._id, mongoose.Types.ObjectId()]
                });

                child.save(function(err, child) {
                    should.not.exist(err);
                    Parent.find({
                        _id: {
                            $in: child.parents
                        }
                    }, function(err, parents) {
                        parents.should.have.length(child.parents.length);
                        parents.should.containDeep([{
                            _id: child.parents[0]
                        }]);
                        parents.should.containDeep([{
                            _id: child.parents[1]
                        }]);
                        done(err);
                    });
                });
            });
        });
    });

    describe("One-To-One", function() {
        var Child, Parent;
        before(function() {
            var ParentSchema = new Schema({
                child: {
                    type: ObjectId,
                    ref: "ChildOneOne"
                }
            });
            Parent = mongoose.model("ParentOneOne", ParentSchema);

            var ChildSchema = new Schema({
                name: String,
                parent: {
                    type: ObjectId,
                    ref: "ParentOneOne",
                    childPath: "child"
                }
            });
            ChildSchema.plugin(relationship, {
                relationshipPathName: 'parent',
                triggerMiddleware: false
            });
            Child = mongoose.model("ChildOneOne", ChildSchema);
        });

        beforeEach(function() {
            this.parent = new Parent({});
            this.child = new Child({});
        });

        it("should not add a child if the parent does not exist in the database", function(done) {
            this.child.parent = this.parent._id;
            this.child.save(function(err, child) {
                should.not.exist(err);
                Parent.findById(child.parent, function(err, parent) {
                    should.not.exist(parent);
                    done(err);
                });
            });
        });

        describe("Save Actions", function() {
            beforeEach(function(done) {
                var self = this;
                self.parent.save(function(err, parent) {
                    self.child.parent = self.parent._id;
                    self.child.save(function(err, child) {
                        done(err);
                    });
                });
            });

            it("should add a child to the parent collection if the parent is set", function(done) {
                var self = this;
                Parent.findById(this.child.parent, function(err, parent) {
                    parent.child.should.eql(self.child._id);
                    done(err);
                });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    Parent.findById(child.parent, function(err, parent) {
                        should.not.exist(parent.child);
                        done(err);
                    });
                });
            });

            it("should remove a child from the parent if the child relationship is unset", function(done) {
                var self = this;
                self.child.parent = undefined;
                self.child.save(function(err, child) {
                    should.not.exist(err);
                    should.not.exist(child.parent);
                    Parent.findById(self.parent._id, function(err, parent) {
                        should.not.exist(parent.child);
                        done(err);
                    });
                });
            });
        });
    });

    describe("Parent Existence", function() {
        describe("Single Parent", function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    children: [{
                        type: ObjectId,
                        ref: "ChildOneManyValidate"
                    }]
                });
                Parent = mongoose.model("ParentOneManyValidate", ParentSchema);

                var ChildSchema = new Schema({
                    name: String,
                    parent: {
                        type: ObjectId,
                        ref: "ParentOneManyValidate",
                        childPath: "children",
                        validateExistence: true
                    }
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'parent',
                    triggerMiddleware: false
                });
                Child = mongoose.model("ChildOneManyValidate", ChildSchema);
            });

            beforeEach(function() {
                this.child = new Child({
                    parent: new mongoose.Types.ObjectId()
                });
            });

            it("should validate the existence of the relationship before saving if the flag is set", function(done) {
                this.child.save(function(err, child) {
                    should.exist(err);
                    err.errors.parent.message.should.eql("Relationship entity ParentOneManyValidate does not exist");
                    done();
                });
            });

            it('should create the relationship if the parent actually exists', function(done) {
                var parent = new Parent();
                this.child.parent = parent;

                var self = this;
                parent.save(function(err, parent) {
                    self.child.save(function(err, child) {
                        child.should.exist;
                        done(err);
                    });
                });
            });

            it('should create and remove the relationship if the parent actually exists', function(done) {
                var parent = new Parent();
                this.child.parent = parent;

                var self = this;
                async.series([
                        function(cb) {
                            parent.save(function(err, parent) {
                                parent.children.should.be.lengthOf(0);
                                cb(err);
                            });
                        },
                        function(cb) {
                            self.child.save(function(err, child) {
                                child.should.exist;
                                child.parent.should.exist;
                                cb(err);
                            });
                        },
                        function(cb) {
                            Parent.findById(parent._id, function(err, parent) {
                                should.not.exist(err);
                                parent.children.should.be.lengthOf(1);
                                parent.children = [];
                                parent.save(function(err, parent) {
                                    parent.should.exist;
                                    cb(err);
                                });
                            });
                        }
                    ],
                    done);
            });
        });

        describe("Multiple Parents", function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    children: [{
                        type: ObjectId,
                        ref: "ChildManyManyValidate"
                    }]
                });
                Parent = mongoose.model("ParentManyManyValidate", ParentSchema);

                var ChildSchema = new Schema({
                    name: String,
                    parents: [{
                        type: ObjectId,
                        ref: "ParentManyManyValidate",
                        childPath: "children",
                        validateExistence: true
                    }]
                });
                ChildSchema.plugin(relationship, {
                    relationshipPathName: 'parents',
                    triggerMiddleware: false
                });
                Child = mongoose.model("ChildManyManyValidate", ChildSchema);
            });

            beforeEach(function() {
                this.child = new Child({
                    parents: [new mongoose.Types.ObjectId()]
                });
            });

            it("should validate the existence of the relationship before saving if the flag is set", function(done) {
                this.child.save(function(err, child) {
                    should.exist(err);
                    err.errors.parents.message.should.eql("Relationship entity ParentManyManyValidate does not exist");
                    done();
                });
            });

            it('should fail if just one id in the relationship list does not exist', function(done) {
                var parent = new Parent();
                this.child.parents = [parent, new mongoose.Types.ObjectId()];

                var self = this;
                parent.save(function(err, parent) {
                    self.child.save(function(err, child) {
                        should.exist(err);
                        err.errors.parents.message.should.eql("Relationship entity ParentManyManyValidate does not exist");
                        done();
                    });
                });
            });

            it('should create the relationship if the parent actually exists', function(done) {
                var parent = new Parent();
                this.child.parents = [parent];

                var self = this;
                parent.save(function(err, parent) {
                    self.child.save(function(err, child) {
                        child.should.exist;
                        done(err);
                    });
                });
            });
        });
    });

    describe("One-To-Many", function() {
        var Child, Parent;
        before(function() {
            var ParentSchema = new Schema({
                children: [{
                    type: ObjectId,
                    ref: "ChildOneMany"
                }]
            });
            Parent = mongoose.model("ParentOneMany", ParentSchema);

            var ChildSchema = new Schema({
                name: String,
                parent: {
                    type: ObjectId,
                    ref: "ParentOneMany",
                    childPath: "children"
                }
            });
            ChildSchema.plugin(relationship, {
                relationshipPathName: 'parent',
                triggerMiddleware: false
            });
            Child = mongoose.model("ChildOneMany", ChildSchema);
        });

        beforeEach(function() {
            this.parent = new Parent({});
            this.child = new Child({});
        });

        it("should not add a child if the parent does not exist in the database", function(done) {
            this.child.parent = this.parent._id;
            this.child.save(function(err, child) {
                should.not.exist(err);
                Parent.findById(child.parent, function(err, parent) {
                    should.not.exist(parent);
                    done(err);
                });
            });
        });

        describe("Save Actions", function() {
            beforeEach(function(done) {
                var self = this;
                self.parent.save(function(err, parent) {
                    self.child.parent = self.parent._id;
                    self.child.save(function(err, child) {
                        done(err);
                    });
                });
            });

            it("should add a child to the parent collection if the parent is set", function(done) {
                var self = this;
                Parent.findById(this.child.parent, function(err, parent) {
                    parent.children.should.containEql(self.child._id);
                    done(err);
                });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    Parent.findById(child.parent, function(err, parent) {
                        parent.children.should.not.containEql(child._id);
                        done(err);
                    });
                });
            });

            it("should remove a child from the parent if the child relationship is unset", function(done) {
                var self = this;
                self.child.parent = undefined;
                self.child.save(function(err, child) {
                    should.not.exist(err);
                    should.not.exist(child.parent);
                    Parent.findById(self.parent._id, function(err, parent) {
                        parent.children.should.be.empty;
                        done(err);
                    });
                });
            });
        });
    });

    describe("Many-To-Many", function() {
        var Child, Parent;
        before(function() {
            var ParentSchema = new Schema({
                children: [{
                    type: ObjectId,
                    ref: "ChildManyMany"
                }]
            });
            Parent = mongoose.model("ParentManyMany", ParentSchema);

            var ChildSchema = new Schema({
                name: String,
                parents: [{
                    type: ObjectId,
                    ref: "ParentManyMany",
                    childPath: "children"
                }]
            });
            ChildSchema.plugin(relationship, {
                relationshipPathName: 'parents',
                triggerMiddleware: false
            });
            Child = mongoose.model("ChildManyMany", ChildSchema);
        });

        beforeEach(function() {
            this.parent = new Parent({});
            this.otherParent = new Parent({});
            this.child = new Child({});
        });

        it("should not add a child if the parent does not exist in the database", function(done) {
            this.child.parents.push(this.parent._id);
            this.child.parents.push(this.otherParent._id);
            this.child.save(function(err, child) {
                should.not.exist(err);
                Parent.find({
                    _id: {
                        $in: child.parents
                    }
                }, function(err, parents) {
                    parents.should.be.empty;
                    done(err);
                });
            });
        });

        describe("Save Actions", function() {
            beforeEach(function(done) {
                var self = this;
                self.parent.save(function(err, parent) {
                    self.otherParent.save(function(err, otherParent) {
                        self.child.parents.push(parent._id);
                        self.child.parents.push(otherParent._id);
                        self.child.save(function(err, child) {
                            done(err);
                        });
                    });
                });
            });

            it("should add a child to the parent collection if the parent is set", function(done) {
                var self = this;
                Parent.find({
                    _id: {
                        $in: this.child.parents
                    }
                }, function(err, parents) {
                    var parent;
                    for (var i = 0; i < parents.length; i++) {
                        parent = parents[i];
                        parent.should.have.property('children').containEql(self.child._id);
                    }
                    done(err);
                });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    Parent.find({
                        _id: {
                            $in: self.child.parents
                        }
                    }, function(err, parents) {
                        var parent;
                        for (var i = 0; i < parents.length; i++) {
                            parent = parents[i];
                            parent.should.have.property('children').not.containEql(self.child._id);
                        }
                        done(err);
                    });
                });
            });

            it("should remove a child from the parent collection if parent is removed from child's set", function(done) {
                var self = this;
                self.child.parents = [self.otherParent._id];
                self.child.save(function(err, child) {
                    should.not.exist(err);
                    Parent.find({
                        children: {
                            $in: [child._id]
                        }
                    }, function(err, parents) {
                        parents.should.have.a.lengthOf(1);
                        parents[0]._id.should.eql(self.otherParent._id);
                        done(err);
                    });
                });
            });

            it("should remove a child from the parents if the child relationship is removed from its parent list", function(done) {
                var self = this;
                self.child.parents = self.child.parents.splice(0, 1);
                self.child.save(function(err, child) {
                    should.not.exist(err);
                    child.parents.should.have.length(1);
                    async.parallel([
                            function(cb) {
                                Parent.findById(self.otherParent._id, function(err, parent) {
                                    parent.children.should.be.empty;
                                    cb(err);
                                });
                            },
                            function(cb) {
                                Parent.findById(self.parent._id, function(err, parent) {
                                    parent.children.should.containEql(self.child._id);
                                    cb(err);
                                });
                            }
                        ],
                        done);
                });
            });

        });
    });

    describe("Many-To-Many With Multiple relationships", function() {
        var Child, Parent, OtherParent;
        before(function() {
            var ParentSchema = new Schema({
                children: [{
                    type: ObjectId,
                    ref: "ChildMultiple"
                }]
            });
            Parent = mongoose.model("ParentMultiple", ParentSchema);

            var OtherParentSchema = new Schema({
                otherChildren: [{
                    type: ObjectId,
                    ref: "ChildMultiple"
                }]
            });
            OtherParent = mongoose.model("OtherParentMultiple", OtherParentSchema);

            var ChildSchema = new Schema({
                name: String,
                parents: [{
                    type: ObjectId,
                    ref: "ParentMultiple",
                    childPath: "children"
                }],
                otherParents: [{
                    type: ObjectId,
                    ref: "OtherParentMultiple",
                    childPath: "otherChildren"
                }]
            });
            ChildSchema.plugin(relationship, {
                relationshipPathName: ['parents', 'otherParents'],
                triggerMiddleware: false
            });
            Child = mongoose.model("ChildMultiple", ChildSchema);
        });

        beforeEach(function() {
            this.parent = new Parent({});
            this.otherParent = new OtherParent({});
            this.child = new Child({});
        });

        it("should not add a child if the parent does not exist in the database", function(done) {
            this.child.parents.push(this.parent._id);
            this.child.otherParents.push(this.otherParent._id);
            this.child.save(function(err, child) {
                should.not.exist(err);
                async.parallel([
                        function(callback) {
                            Parent.find({
                                _id: {
                                    $in: child.parents
                                }
                            }, function(err, parents) {
                                parents.should.be.empty;
                                callback(err);
                            });
                        },
                        function(callback) {
                            OtherParent.find({
                                _id: {
                                    $in: child.otherParents
                                }
                            }, function(err, parents) {
                                parents.should.be.empty;
                                callback(err);
                            });
                        }
                    ],
                    function(err) {
                        done(err);
                    });
            });
        });

        describe("Save Actions", function() {
            beforeEach(function(done) {
                var self = this;
                self.parent.save(function(err, parent) {
                    self.otherParent.save(function(err, otherParent) {
                        self.child.parents.push(parent._id);
                        self.child.otherParents.push(otherParent._id);
                        self.child.save(function(err, child) {
                            done(err);
                        });
                    });
                });
            });

            it("should add a child to the parent collection if the parent is set", function(done) {
                var self = this;
                async.parallel([
                        function(callback) {
                            Parent.find({
                                _id: {
                                    $in: self.child.parents
                                }
                            }, function(err, parents) {
                                var parent;
                                for (var i = 0; i < parents.length; i++) {
                                    parent = parents[i];
                                    parent.should.have.property('children').containEql(self.child._id);
                                }
                                callback(err);
                            });
                        },
                        function(callback) {
                            OtherParent.find({
                                _id: {
                                    $in: self.child.otherParents
                                }
                            }, function(err, parents) {
                                var parent;
                                for (var i = 0; i < parents.length; i++) {
                                    parent = parents[i];
                                    parent.should.have.property('otherChildren').containEql(self.child._id);
                                }
                                callback(err);
                            });
                        }
                    ],
                    function(err) {
                        done(err);
                    });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    async.parallel([
                            function(callback) {
                                Parent.find({
                                    _id: {
                                        $in: self.child.parents
                                    }
                                }, function(err, parents) {
                                    var parent;
                                    for (var i = 0; i < parents.length; i++) {
                                        parent = parents[i];
                                        parent.should.have.property('children').not.containEql(self.child._id);
                                    }
                                    callback(err);
                                });
                            },
                            function(callback) {
                                OtherParent.find({
                                    _id: {
                                        $in: self.child.otherParents
                                    }
                                }, function(err, parents) {
                                    var parent;
                                    for (var i = 0; i < parents.length; i++) {
                                        parent = parents[i];
                                        parent.should.have.property('otherChildren').not.containEql(self.child._id);
                                    }
                                    callback(err);
                                });
                            }
                        ],
                        function(err) {
                            done(err);
                        });
                });
            });
        });
    });
});
