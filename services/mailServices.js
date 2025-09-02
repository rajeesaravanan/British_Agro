const transporter = require('../config/mail')
const path = require('path')
const fs = require('fs')

async function sendMail(to, subject, templateName, replacements = {}){
    try{
        const templatepath = path.join(__dirname, '..', 'templates', `${templateName}.html`)
        let html = fs.readFileSync(templatepath, 'utf-8')

        // Object.keys(replacements).forEach(key => {
        //     html = html.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key])
        // })

        const mailOptions = {
            from: process.env.EMAIL_FROM,
            to, 
            subject,
            html
        }

        const info = await transporter.sendMail(mailOptions)
        return info
    }catch(error){
        console.error('Email sending failer: ', error)
        throw new Error('Failed to send email')
    }

}

module.exports = { sendMail }