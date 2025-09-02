const express = require('express')
const mongoose = require('mongoose')
const cors = require('cors')

require('dotenv').config()

const phaseRouter = require('./router/phase.router')
const roomRouter = require('./router/room.router')
const stageRouter = require('./router/stage.router')
const productionRouter = require('./router/production.router')
const excelRouter = require('./router/excel.router')
const mailRouter = require('./router/mail.router')
const excelMailRouter = require('./router/excelMail.router')


const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }));


// routes
app.use('/api/phases', phaseRouter, roomRouter, stageRouter)
app.use('/api/phases',productionRouter)
app.use('/api/mail', mailRouter)

app.use('/api/excel', excelRouter)
app.use('/api/excelMail', excelMailRouter)

mongoose.connect('mongodb://127.0.0.1:27017/agroDashboard')
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => console.error('Error connecting to MongoDB:', err));


  const PORT = process.env.PORT || 4000
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`))