const xlsx = require('xlsx')

function readEmailFromExcel(filePath){
    const workbook = xlsx.readFile(filePath)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const data = xlsx.utils.sheet_to_json(sheet)
    
    const emails = data.map(row => row.Email).filter(Boolean)
    return emails
}


module.exports = {readEmailFromExcel}