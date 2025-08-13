const mongoose = require("mongoose");

const productionRequestSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, 
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
  phase: { type: mongoose.Schema.Types.ObjectId, ref: "Phase", required: true },
  stage: { type: mongoose.Schema.Types.ObjectId, ref: "Stage", required: true },
  flow: { type: String, required: true },
  startDate: { type: Date, required: true },
}, { timestamps: true });

module.exports = mongoose.model("ProductionRequest", productionRequestSchema);
