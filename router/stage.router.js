const router = require('express').Router()
const Stage = require('../models/stage.model')

// get
router.get('/get-stage', async(req, res)=>{
    const stages = await Stage.find()

    res.json(stages)
})

// post
router.post('/create-stage', async(req, res)=>{
    const {name, code, position, minDays, maxDays} = req.body
    const newStage = new Stage({name, code, position, minDays, maxDays})
    await newStage.save()
    res.json({message:"Stage added", data: newStage})
})

module.exports = router


