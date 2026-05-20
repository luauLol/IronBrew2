# Deobfuscator API

A REST API for deobfuscating Lua scripts using the custom deobfuscator.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
node server.js
```

The API will run on `http://localhost:3000`

## API Endpoints

### Health Check
```
GET /
```

Response:
```json
{
  "status": "ok",
  "message": "Deobfuscator API is running"
}
```

### Deobfuscate
```
POST /deobfuscate
Content-Type: multipart/form-data

file: <lua file>
```

Response:
```json
{
  "success": true,
  "output": "<deobfuscated lua code>"
}
```

## Deployment - Railway (Easiest)

**STOP: Cloudflare Workers/Pages cannot run this API because:**
- The deobfuscator needs file system access (Cloudflare Workers doesn't have this)
- Express.js is not supported on Cloudflare Workers
- Deobfuscation requires more CPU time than Workers allow

**Use Railway instead - it's free and supports Node.js Express apps:**

### Step 1: Push to GitHub
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### Step 2: Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your repository
4. Railway will auto-detect Node.js
5. Click "Deploy"
6. Railway will give you a URL like `https://your-app.railway.app`

That's it! Your API is now live.

## Alternative: Render (Also Free)

1. Go to [render.com](https://render.com)
2. Click "New" → "Web Service"
3. Connect your GitHub repository
4. Build Command: `npm install`
5. Start Command: `node server.js`
6. Click "Deploy Web Service"

## Usage Example

### Using curl:
```bash
curl -X POST -F "file=@input.lua" https://your-app.railway.app/deobfuscate
```

### Using JavaScript:
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('https://your-app.railway.app/deobfuscate', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log(data.output);
});
```

### Using Python:
```python
import requests

with open('input.lua', 'rb') as f:
    files = {'file': f}
    response = requests.post('https://your-app.railway.app/deobfuscate', files=files)
    print(response.json()['output'])
```

## Notes

- The deobfuscator requires significant CPU time for complex scripts
- Railway free tier: 500 hours/month (enough for testing)
- Consider adding rate limiting for production use
- File size limits may need adjustment based on your needs
