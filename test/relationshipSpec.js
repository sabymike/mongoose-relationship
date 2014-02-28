var mongoose = require("mongoose"),
    _ = require("underscore"),
    should = require("should"),
    async = require("async"),
    relationship = require("../");
var Schema = mongoose.Schema;

mongoose.connect(process.env.MONGODB_URL || "mongodb://localhost:27017/mongoose-relationship");

describe("Schema Key Tests", function() {
    describe("Testing initialization", function() {
        var ParentSchema = new Schema({

        });

        var ChildSchema = new Schema({
            name:String,
        });

        it("should throw an error if the path is not present in the schema", function() {
            (function() {
                ChildSchema.plugin(relationship);
            }).should.throw('No relationship path defined');
        });

        it("should throw an error if a ref is not provided on the relationship path", function() {
            (function() {
                ChildSchema.add({relation: Schema.ObjectId });
                ChildSchema.plugin(relationship, { relationshipPathName: 'relation' });
            }).should.throw('Relationship relation requires a ref');
        });

        it("should thrown an error if the relationship path does not have a child collection option", function() {
            (function() {
                ChildSchema.add({relation:{ type: Schema.ObjectId, ref:'ParentSchema'}});
                ChildSchema.plugin(relationship, { relationshipPathName: 'relation' });
            }).should.throw('Relationship relation requires a childPath for its parent');
        });

        it("should not throw an error if all the parameters are set correctly", function() {
            (function() {
                ChildSchema.add({relation:{ type: Schema.ObjectId, ref:'ParentSchema', childPath:"children"}});
                ChildSchema.plugin(relationship, { relationshipPathName: 'relation' });
            }).should.not.throw();
        });
    });

    describe("One-To-One", function() {
        var Child, Parent;
        before(function() {
            var ParentSchema = new Schema({
                child: { type:Schema.ObjectId, ref:"ChildOneOne" }
            });
            Parent = mongoose.model("ParentOneOne", ParentSchema);

            var ChildSchema = new Schema({
                name:String,
                parent: { type: Schema.ObjectId, ref: "ParentOneOne", childPath: "child" }
            });
            ChildSchema.plugin(relationship, { relationshipPathName: 'parent' });
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
        });
    });

    describe("Parent Existence", function() {
        describe("Single Parent", function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    children:[{type:Schema.ObjectId, ref:"ChildOneManyValidate" }]
                });
                Parent = mongoose.model("ParentOneManyValidate", ParentSchema);

                var ChildSchema = new Schema({
                    name:String,
                    parent: { type: Schema.ObjectId, ref:"ParentOneManyValidate", childPath:"children", validateExistence:true }
                });
                ChildSchema.plugin(relationship, { relationshipPathName: 'parent' });
                Child = mongoose.model("ChildOneManyValidate", ChildSchema);
            });

            beforeEach(function() {
                this.child = new Child({parent:new mongoose.Types.ObjectId()});
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
        });

        describe("Multiple Parents", function() {
            var Child, Parent;
            before(function() {
                var ParentSchema = new Schema({
                    children:[{type:Schema.ObjectId, ref:"ChildManyManyValidate" }]
                });
                Parent = mongoose.model("ParentManyManyValidate", ParentSchema);

                var ChildSchema = new Schema({
                    name:String,
                    parents: [{ type: Schema.ObjectId, ref:"ParentManyManyValidate", childPath:"children", validateExistence:true }]
                });
                ChildSchema.plugin(relationship, { relationshipPathName: 'parents' });
                Child = mongoose.model("ChildManyManyValidate", ChildSchema);
            });

            beforeEach(function() {
                this.child = new Child({parents:[new mongoose.Types.ObjectId()]});
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
                children:[{type:Schema.ObjectId, ref:"ChildOneMany" }]
            });
            Parent = mongoose.model("ParentOneMany", ParentSchema);

            var ChildSchema = new Schema({
                name:String,
                parent: { type: Schema.ObjectId, ref:"ParentOneMany", childPath:"children" }
            });
            ChildSchema.plugin(relationship, { relationshipPathName: 'parent' });
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
        });
    });

    describe("Many-To-Many", function() {
        var Child, Parent;
        before(function() {
            var ParentSchema = new Schema({
                children:[{type:Schema.ObjectId, ref:"ChildManyMany" }]
            });
            Parent = mongoose.model("ParentManyMany", ParentSchema);

            var ChildSchema = new Schema({
                name:String,
                parents: [{ type: Schema.ObjectId, ref:"ParentManyMany", childPath:"children" }]
            });
            ChildSchema.plugin(relationship, { relationshipPathName: 'parents' });
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
                Parent.find({ _id: { $in: child.parents }}, function(err, parents) {
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
                Parent.find({ _id: { $in: this.child.parents }}, function(err, parents) {
                    var parent;
                    for ( var i = 0; i < parents.length; i++ )
                    {
                        parent = parents[i];
                        parent.should.have.property('children').containEql(self.child._id);
                    }
                    done(err);
                });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    Parent.find({ _id: { $in: self.child.parents }}, function(err, parents) {
                        var parent;
                        for ( var i = 0; i < parents.length; i++ )
                        {
                            parent = parents[i];
                            parent.should.have.property('children').not.containEql(self.child._id);
                        }
                        done(err);
                    });
                });
            });
        });
    });

    describe("Many-To-Many With Multiple relationships", function() {
        var Child, Parent, OtherParent;
        before(function() {
            var ParentSchema = new Schema({
                children:[{type:Schema.ObjectId, ref:"ChildMultiple" }]
            });
            Parent = mongoose.model("ParentMultiple", ParentSchema);

            var OtherParentSchema = new Schema({
                otherChildren:[{ type:Schema.ObjectId, ref:"ChildMultiple" }]
            });
            OtherParent = mongoose.model("OtherParentMultiple", OtherParentSchema);

            var ChildSchema = new Schema({
                name:String,
                parents: [{ type: Schema.ObjectId, ref:"ParentMultiple", childPath:"children" }],
                otherParents: [{ type: Schema.ObjectId, ref:"OtherParentMultiple", childPath:"otherChildren" }]
            });
            ChildSchema.plugin(relationship, { relationshipPathName: ['parents', 'otherParents'] });
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
                        Parent.find({ _id: { $in: child.parents }}, function(err, parents) {
                            parents.should.be.empty;
                            callback(err);
                        });
                    },
                    function(callback) {
                        OtherParent.find({ _id: { $in: child.otherParents }}, function(err, parents) {
                            parents.should.be.empty;
                            callback(err);
                        });
                    }],
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
                        Parent.find({ _id: { $in: self.child.parents }}, function(err, parents) {
                            var parent;
                            for ( var i = 0; i < parents.length; i++ )
                            {
                                parent = parents[i];
                                parent.should.have.property('children').containEql(self.child._id);
                            }
                            callback(err);
                        });
                    },
                    function(callback) {
                        OtherParent.find({ _id: { $in: self.child.otherParents }}, function(err, parents) {
                            var parent;
                            for ( var i = 0; i < parents.length; i++ )
                            {
                                parent = parents[i];
                                parent.should.have.property('otherChildren').containEql(self.child._id);
                            }
                            callback(err);
                        });
                    }],
                    function(err) {
                        done(err);
                    });
            });

            it("should remove a child from the parent collection if the parent is set", function(done) {
                var self = this;
                self.child.remove(function(err, child) {
                    async.parallel([
                        function(callback) {
                            Parent.find({ _id: { $in: self.child.parents }}, function(err, parents) {
                                var parent;
                                for ( var i = 0; i < parents.length; i++ )
                                {
                                    parent = parents[i];
                                    parent.should.have.property('children').not.containEql(self.child._id);
                                }
                                callback(err);
                            });
                        },
                        function(callback) {
                            OtherParent.find({ _id: { $in: self.child.otherParents }}, function(err, parents) {
                                var parent;
                                for ( var i = 0; i < parents.length; i++ )
                                {
                                    parent = parents[i];
                                    parent.should.have.property('otherChildren').not.containEql(self.child._id);
                                }
                                callback(err);
                            });
                        }],
                        function(err) {
                            done(err);
                        });
                });
            });
        });
    });
});