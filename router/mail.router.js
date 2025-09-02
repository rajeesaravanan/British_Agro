const express = require('express')
const router = express.Router()
const {sendMail} = require('../services/mailServices')

router.post('/send-mail', async (req, res) => {
    try{
        const {to, subject} = req.body 

        await sendMail(to, subject, 'welcome')

        res.status(200).json({message: 'Email sent successfully'})
    }catch(error){
        console.error('Email sending failed: ', error)
        res.status(500).json({error: 'Failed to send email'})
    }
})

module.exports = router