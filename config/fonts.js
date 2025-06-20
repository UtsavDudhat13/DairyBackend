// config/fonts.js
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Font paths configuration
export const FONTS = {
    // You'll need to download these fonts and place them in the fonts directory
    gujarati: {
        regular: path.join(__dirname, '../fonts/NotoSansGujarati-Regular.ttf'),
        bold: path.join(__dirname, '../fonts/NotoSansGujarati-Bold.ttf')
    },
    english: {
        regular: path.join(__dirname, '../fonts/Helvetica.ttf'),
        bold: path.join(__dirname, '../fonts/Helvetica-Bold.ttf')
    }
};

// Helper to register fonts in PDFKit
export const registerFonts = (doc) => {
    try {
        // Register Gujarati fonts
        doc.registerFont('Gujarati', FONTS.gujarati.regular);
        doc.registerFont('Gujarati-Bold', FONTS.gujarati.bold);

        // Register English fonts (optional, PDFKit has defaults)
        doc.registerFont('English', FONTS.english.regular);
        doc.registerFont('English-Bold', FONTS.english.bold);

        // Set default font
        doc.font('Gujarati');

        return true;
    } catch (error) {
        console.error('Font registration error:', error);
        // Fallback to default fonts if custom fonts fail
        return false;
    }
};