const router = require('express').Router()
const Phase = require('../models/phase.model')


// NEW: base route so GET /api/phases works
router.get('/', async (req, res) => {
  const phases = await Phase.find();
  res.json(phases);
});




// get
router.get('/getPhase', async(req, res)=>{
    const phases = await Phase.find()
    res.json(phases)
})

// post
router.post('/createPhase', async(req, res)=>{
    const {name, status} = req.body
    const newPhase = new Phase({name, status})
    await newPhase.save()
    res.json({message: "Phase added", data: newPhase})
})

module.exports = router