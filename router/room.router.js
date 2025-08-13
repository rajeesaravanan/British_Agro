const router = require('express').Router()
const Room = require('../models/room.model')


// NEW: GET /api/phases/rooms?phaseId=...
router.get('/rooms', async (req, res) => {
  const { phaseId } = req.query;
  const query = phaseId ? { phase_id: phaseId } : {};
  const rooms = await Room.find(query).populate('phase_id', 'name');
  res.json(rooms);
});



// get
router.get('/getRoom', async(req, res)=>{
    const rooms = await Room.find().populate('phase_id', 'name')
    res.json(rooms)
})


// post
router.post('/createRoom', async(req, res)=>{
    const {room_number, phase_id, status} = req.body
    const newRoom = new Room({ room_number, phase_id, status})
    await newRoom.save()
    res.json({message: "Room added"})
})


module.exports =  router