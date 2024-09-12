const axios = require('axios');
const cron = require('node-cron');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');

// List of URLs to check
const websites = [
    { name: 'SCPL', url: 'https://scpl.biz/' },
    { name: 'RMC', url: 'https://rmc.in/' },
    { name: 'Spechem', url: 'https://spechem.biz/' },
    { name: 'RMCPC', url: 'https://rmcpc.com/' },
    { name: 'CETL', url: 'https://cetl.in/' }
];

// Function to check website status
const checkWebsiteStatus = async (url) => {
    try {
        const response = await axios.get(url, { timeout: 5000 }); 
        if (response.status === 200) {
            return 'Up'; 
        } else if (response.status >= 400 && response.status < 500) {
            return `Down (Client Error: ${response.status})`;
        } else if (response.status >= 500) {
            return `Down (Server Error: ${response.status})`; 
        } else {
            return `Unknown Status (Code: ${response.status})`; 
        }
    } catch (error) {
        if (error.code === 'ECONNREFUSED') {
            return 'Down (Connection Refused)'; 
        } else if (error.code === 'ETIMEDOUT') {
            return 'Down (Timeout)'; 
        } else if (error.code === 'ENOTFOUND') {
            return 'Down (DNS Lookup Failed)'; 
        } else if (error.code === 'ERR_SSL_CERT') {
            return 'Down (SSL Certificate Error)'; 
        } else if (error.message && error.message.includes('too many redirects')) {
            return 'Down (Redirect Loop)'; 
        } else if (error.response && error.response.status === 401) {
            return 'Down (Unauthorized Access)'; // 401 Unauthorized
        } else if (error.response && error.response.status === 403) {
            return 'Down (Forbidden)'; // 403 Forbidden
        } else if (error.response && error.response.status === 404) {
            return 'Down (Not Found)'; // 404 Not Found
        } else if (error.message && error.message.includes('Network Unreachable')) {
            return 'Down (Network Unreachable)'; // General network issue
        } else if (error.response) {
            return `Down (Error Code: ${error.response.status})`; // Error response with status code
        } else {
            return 'Down (Unknown Error)'; // Other unknown errors
        }
    }
};



// Function to draw a table in the PDF without borders
const drawTable = (doc, startX, startY, data) => {
    const rowHeight = 20;
    const columnWidth = [200, 300, 100]; // Width for each column

    // Draw table header
    doc.fontSize(12).font('Helvetica-Bold');
    doc.text('Website Name', startX, startY);
    doc.text('URL', startX + columnWidth[0], startY);
    doc.text('Status', startX + columnWidth[0] + columnWidth[1], startY);
    doc.moveDown();

    // Draw table content
    doc.fontSize(12).font('Helvetica');
    let y = startY + rowHeight;
    data.forEach((row) => {
        doc.text(row.name, startX, y);
        doc.text(row.url, startX + columnWidth[0], y);
        doc.text(row.status, startX + columnWidth[0] + columnWidth[1], y);
        y += rowHeight;
    });
};

// Function to generate the PDF report
const generateReport = async (filePath) => {
    const doc = new PDFDocument();
    doc.pipe(fs.createWriteStream(filePath));

    doc.fontSize(20).text('Website Status Report', { align: 'center' });
    doc.moveDown();

    // Prepare data for table
    const tableData = [];
    for (const site of websites) {
        const status = await checkWebsiteStatus(site.url);
        tableData.push({ name: site.name, url: site.url, status });
    }

    // Draw table
    drawTable(doc, 50, 100, tableData);

    doc.end();

    console.log(`Report generated: ${filePath}`);
    return filePath;
};

// Function to send email
const sendEmail = async (filePath) => {
    // Create a transporter object using SMTP transport
    const transporter = nodemailer.createTransport({
        service: 'gmail', // Replace with your email service
        auth: {
            user: 'tech.support@rmc.in', // Replace with your email address
            pass: 'tzbh kngd yfaz dbwt'   // Replace with your email password
        }
    });

    // Email options
    const mailOptions = {
        from: 'tech.support@rmc.in', // Replace with your email address
        to: 'it@rmc.in',
        subject: 'Website Status Report',
        text: 'Please find the attached website status report.',
        attachments: [
            {
                path: filePath
            }
        ]
    };

    // Send the email
    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to tech.support@rmc.in with attachment: ${filePath}`);
    } catch (error) {
        console.error('Error sending email:', error);
    }
};

// Initialize Express app
const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Serve the HTML form
app.get('/', (req, res) => {
    res.send(`
        <h1>Website Status Checker</h1>
        <form action="/set-path" method="post">
            <label for="path">Enter Download Path:</label><br>
            <input type="text" id="path" name="path" placeholder="e.g., /path/to/download/"><br><br>
            <input type="submit" value="Set Path">
        </form>
    `);
});

// Handle the form submission
app.post('/set-path', async (req, res) => {
    const downloadPath = req.body.path;
    const fullPath = path.join(downloadPath, `Website_Status_Report_${new Date().toISOString().split('T')[0]}.pdf`);

    await generateReport(fullPath);
    await sendEmail(fullPath);

    res.send(`<h2>PDF generated and sent to email at: ${fullPath}</h2>`);
});

// Run the report generation when the server starts
(async () => {
    console.log('Server started. Generating initial report...');
    const initialReportPath = path.join(__dirname, `Website_Status_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    await generateReport(initialReportPath);
    await sendEmail(initialReportPath);
})();

// Schedule the task to run daily at 12:00 PM
cron.schedule('0 12 * * *', async () => {
    console.log('Checking website status and generating daily report...');
    const dailyReportPath = path.join(__dirname, `Website_Status_Report_${new Date().toISOString().split('T')[0]}.pdf`);
    await generateReport(dailyReportPath);
    await sendEmail(dailyReportPath);
});

app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
