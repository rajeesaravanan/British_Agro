const mongoose = require("mongoose");

const RoomSchema = new mongoose.Schema(
  {
    room_number: {
      type: String,
      required: true,
    },
    phase_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Phase",
    },
    status: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model("Room", RoomSchema)
