const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { readEmailFromExcel } = require('../services/excelService');
const { sendMail } = require('../services/mailServices');

const upload = multer({ dest: 'uploads/' }); 


router.post('/send-bulk-mail', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'Excel file is required' });

        const filePath = path.join(__dirname, '..', req.file.path);
        const emails = readEmailFromExcel(filePath);

        for (const email of emails) {
            try {
                // await sendMail(email, 'Welcome to British Agro Products', 'welcome');
                // await sendMail(email, 'Latest Updates from British Agro Products', 'update');
                // await sendMail(email, 'Latest Promotions', 'promotions');
                await sendMail(email, 'Event Invitation', 'event');




                console.log(`Email sent to: ${email}`);
            } catch (err) {
                console.error(`Failed to send to ${email}:`, err.message);
            }
        }

        res.status(200).json({ message: 'Bulk emails process completed' });
    } catch (err) {
        console.error('Bulk email failed:', err);
        res.status(500).json({ error: 'Failed to send bulk emails' });
    }
});

module.exports = router;
