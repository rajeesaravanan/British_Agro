const mongoose = require('mongoose')

const StageSchema = new mongoose.Schema({
    name: { type: String, required: true},
    code: {type: String, required: true},
    minDays: {type: Number, required: true},
    maxDays: {type: Number, required: true},
    position: {type: Number, required: true}
},
{
    timestamps: true

}
)

module.exports = mongoose.model("Stage", StageSchema)