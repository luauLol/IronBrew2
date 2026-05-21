import express from 'express';
import multer from 'multer';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Deobfuscator API is running' });
});

// Deobfuscate endpoint
app.post('/deobfuscate', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const inputPath = req.file.path;
        const outputPath = path.join('uploads', `deobfuscated_${Date.now()}.lua`);

        // Import and run the deobfuscator
        const { deobfuscate } = await import('./main.js');
        
        await deobfuscate(inputPath, outputPath);

        // Read the deobfuscated output
        const deobfuscatedCode = await fs.readFile(outputPath, 'utf-8');

        // Clean up uploaded files
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});

        res.json({
            success: true,
            output: deobfuscatedCode
        });
    } catch (error) {
        console.error('Deobfuscation error:', error);
        res.status(500).json({ 
            error: 'Deobfuscation failed', 
            message: error.message 
        });
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deobfuscator API running on port ${PORT}`);
});
