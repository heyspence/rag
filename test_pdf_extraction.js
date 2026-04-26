const fs = require("fs");
const path = require("path");
const pdf = require("pdf-parse");
console.log("PDF module type:", typeof pdf);
if (typeof pdf === "object") {
  console.log("PDF module keys:", Object.keys(pdf));
}

async function testPdfExtraction() {
  const documentsDir = path.join(__dirname, "documents");

  console.log(`Checking directory: ${documentsDir}`);

  try {
    if (!fs.existsSync(documentsDir)) {
      console.error("Documents directory does not exist!");
      return;
    }

    const files = fs.readdirSync(documentsDir);
    const pdfFiles = files.filter(
      (file) => path.extname(file).toLowerCase() === ".pdf",
    );

    if (pdfFiles.length === 0) {
      console.log("No PDF files found in the documents folder.");
      return;
    }

    console.log(
      `Found ${pdfFiles.length} PDF files. Starting extraction test...\n`,
    );

    for (const file of pdfFiles) {
      const filePath = path.join(documentsDir, file);
      console.log(`--------------------------------------------------`);
      console.log(`Testing File: ${file}`);

      try {
        const dataBuffer = fs.readFileSync(filePath);
        const data = await pdf(dataBuffer);

        console.log(`Status: Success`);
        console.log(`Page count: ${data.numpages}`);
        console.log(
          `Text length: ${data.text ? data.text.length : 0} characters`,
        );

        if (data.text && data.text.trim().length > 0) {
          console.log(
            `Preview:\n${data.text.substring(0, 200).replace(/\s+/g, " ")}...`,
          );
        } else {
          console.warn(
            "Warning: PDF was parsed but no text content was found (might be a scanned image/OCR needed)",
          );
        }
      } catch (err) {
        console.error(`Status: FAILED`);
        console.error(`Error: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`Fatal error during test: ${err.message}`);
  }
}

testPdfExtraction();
