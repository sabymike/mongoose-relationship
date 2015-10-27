## mongoose-relationship

_**Note**: Maintenence on this module is deprecated. I had personally been using it for a project and over time have realized that bi-directional relationships in mongoose can become extremely complex and hinder performance as a project grows. The more I learn about mongo and designing data for it, the less likely these relationships make sense._

A mongoose plugin that creates and manages relationships between two separate models. These relationships can be One-To-One, One-To-Many, or Many-To-Many. These changes are currently one-direction. If you manipulate a parents "child" property or collection, the child values will not be updated. Only changes made to the child model will update its parent.

#Install
Install via NPM

        npm install mongoose-relationship

# Usage

##One-To-Many
```js
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    relationship = require("mongoose-relationship");

var ParentSchema = new Schema({
    children:[{ type:Schema.ObjectId, ref:"Child" }]
});
var Parent = mongoose.model("Parent", ParentSchema);

var ChildSchema = new Schema({
    parent: { type:Schema.ObjectId, ref:"Parent", childPath:"children" }
});
ChildSchema.plugin(relationship, { relationshipPathName:'parent' });
var Child = mongoose.model("Child", ChildSchema)

var parent = new Parent({});
parent.save();
var child = new Child({parent:parent._id});
child.save() //the parent children property will now contain child's id
child.remove() //the parent children property will no longer contain the child's id
```

##Many-To-Many
```js
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    relationship = require("mongoose-relationship");

var ParentSchema = new Schema({
    children:[{ type:Schema.ObjectId, ref:"Child" }]
});
var Parent = mongoose.model("Parent", ParentSchema);

var ChildSchema = new Schema({
    parents: [{ type:Schema.ObjectId, ref:"Parent", childPath:"children" }]
});
ChildSchema.plugin(relationship, { relationshipPathName:'parents' });
var Child = mongoose.model("Child", ChildSchema)

var parent = new Parent({});
parent.save();
var parentTwo = new Parent({});
parentTwo.save();

var child = new Child({});
child.parents.push(parent);
child.parents.push(parentTwo);
child.save() //both parent and parentTwo children property will now contain the child's id
child.remove() //both parent and parentTwo children property will no longer contain the child's id
```

##Many-To-Many with Multiple paths
```js
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    relationship = require("mongoose-relationship");

var ParentSchema = new Schema({
    children:[{ type:Schema.ObjectId, ref:"Child" }]
});
var Parent = mongoose.model("Parent", ParentSchema);

var OtherParentSchema = new Schema({
    children:[{ type:Schema.ObjectId, ref:"Child" }]
});
var OtherParent = mongoose.model("OtherParent", OtherParentSchema);

var ChildSchema = new Schema({
    parents: [{ type:Schema.ObjectId, ref:"Parent", childPath:"children" }]
    otherParents: [{ type:Schema.ObjectId, ref:"OtherParent", childPath:"children" }]
});
ChildSchema.plugin(relationship, { relationshipPathName:['parents', 'otherParents'] });
var Child = mongoose.model("Child", ChildSchema)

var parent = new Parent({});
parent.save();
var otherParent = new OtherParent({});
otherParent.save();

var child = new Child({});
child.parents.push(parent);
child.otherParents.push(otherParent);
child.save() //both parent and otherParent children property will now contain the child's id
child.remove() //both parent and otherParent children property will no longer contain the child's id
```

##One-To-One
**This usage scenario will overwrite the parent's field of multiple children are assigned the same parent. The use case for this operation seems to be limited and only included for a sense of completion.**

```js
var mongoose = require("mongoose"),
    Schema = mongoose.Schema,
    relationship = require("mongoose-relationship");

var ParentSchema = new Schema({
    child:{ type:Schema.ObjectId, ref:"Child" }
});
var Parent = mongoose.model("Parent", ParentSchema);

var ChildSchema = new Schema({
    parent: { type:Schema.ObjectId, ref:"Parent", childPath:"child" }
});
ChildSchema.plugin(relationship, { relationshipPathName:'parent' });
var Child = mongoose.model("Child", ChildSchema)

var parent = new Parent({});
parent.save();
var child = new Child({parent:parent._id});
child.save() // The parent's child property will now be set to the child's _id;
child.remove() // The parent's child property will now be unset
```

###Options

####Plugin
The plugin currently has the following options

- **relationshipPathName**

    A string or array to let the plugin know which path(s) on your schema the relationship will be created. Defaults to **relationship**

- **triggerMiddleware**

    Boolean value which, if set to true, will explicitly save any parents entities when a relationship is updated causing save middleware to execute. Defaults to **false**

####Path Value
When creating a path on a schema that will represent the relationship, the childPath option is required

- **childPath**

    A string which should match an existing path in target ref schema. If this path does not exist the plugin will have no affect on the target ref.

- **validateExistence**

    Boolean value that tells mongoose-relationship to ensure that the parent exists before setting the relationship for the child. Defaults to **false**

- **upsert**

    Boolean value that controls whether a parent should be created if it does not exist upon child save. Defaults to **false**

# Tests
Test can be run simply by installing and running mocha

    npm install -g mocha
    mocha

#Authors
Mike Sabatini [@mikesabatini](https://twitter.com/mikesabatini)

#License
Copyright Mike Sabatini 2014
Licensed under the MIT License. Enjoy
