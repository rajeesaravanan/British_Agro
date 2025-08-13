const mongoose = require("mongoose");

const productionResultSchema = new mongoose.Schema({
  productionRequestId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ProductionRequest",
    required: true
  },
  room: { type: mongoose.Schema.Types.ObjectId, ref: "Room" },
  phase: { type: mongoose.Schema.Types.ObjectId, ref: "Phase" },
  stage: { type: String },
  flow: { type: String },
  currentFlow: { type: String },
  startDate: { type: Date },
  endDate: { type: Date },
  date: { type: Date },
  createdAt: { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("ProductionResult", productionResultSchema);
