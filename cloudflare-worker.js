export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Use the actual Railway backend URL (not the custom domain)
    const RAILWAY_API = 'https://ironbrew2-production.up.railway.app';

    // Handle API requests
    if (url.pathname === '/deobfuscate' && request.method === 'POST') {
      try {
        const contentType = request.headers.get('content-type') || '';
        
        if (contentType.includes('multipart/form-data')) {
          // File upload - forward to Railway
          const formData = await request.formData();
          const response = await fetch(`${RAILWAY_API}/deobfuscate`, {
            method: 'POST',
            body: formData
          });
          
          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { error: text, status: response.status };
          }
          
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
          });
        } else if (contentType.includes('application/json')) {
          // Text/code input - forward to Railway
          const body = await request.json();
          const response = await fetch(`${RAILWAY_API}/deobfuscate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          
          const text = await response.text();
          let data;
          try {
            data = JSON.parse(text);
          } catch {
            data = { error: text, status: response.status };
          }
          
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // Serve HTML interface
    return new Response(getHTML(), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' }
    });
  }
};

function getHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Prometheus Deobfuscator</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1a0000 0%, #330000 50%, #1a0000 100%);
            min-height: 100vh;
            color: #ffffff;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px;
        }
        
        h1 {
            text-align: center;
            font-size: 3em;
            margin-bottom: 10px;
            background: linear-gradient(90deg, #ff4444, #ff6666, #ff4444);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            animation: glow 2s ease-in-out infinite alternate;
        }
        
        @keyframes glow {
            from {
                text-shadow: 0 0 10px #ff0000, 0 0 20px #ff0000;
            }
            to {
                text-shadow: 0 0 20px #ff0000, 0 0 40px #ff0000;
            }
        }
        
        .subtitle {
            text-align: center;
            color: #ff6666;
            margin-bottom: 40px;
            font-size: 1.2em;
        }
        
        .tabs {
            display: flex;
            justify-content: center;
            margin-bottom: 30px;
        }
        
        .tab {
            padding: 15px 30px;
            margin: 0 10px;
            background: #330000;
            border: 2px solid #ff4444;
            color: #ff6666;
            cursor: pointer;
            transition: all 0.3s ease;
            font-size: 1.1em;
        }
        
        .tab:hover {
            background: #440000;
            box-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
        }
        
        .tab.active {
            background: #ff4444;
            color: #ffffff;
            box-shadow: 0 0 30px rgba(255, 68, 68, 0.7);
        }
        
        .tab-content {
            display: none;
            background: rgba(51, 0, 0, 0.8);
            border: 2px solid #ff4444;
            border-radius: 10px;
            padding: 30px;
            box-shadow: 0 0 30px rgba(255, 68, 68, 0.3);
        }
        
        .tab-content.active {
            display: block;
        }
        
        .input-area {
            width: 100%;
            min-height: 300px;
            background: #1a0000;
            border: 2px solid #ff4444;
            border-radius: 5px;
            color: #ffffff;
            padding: 15px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            resize: vertical;
            margin-bottom: 20px;
        }
        
        .input-area:focus {
            outline: none;
            box-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
        }
        
        .file-upload {
            border: 2px dashed #ff4444;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-bottom: 20px;
        }
        
        .file-upload:hover {
            background: rgba(255, 68, 68, 0.1);
            box-shadow: 0 0 30px rgba(255, 68, 68, 0.3);
        }
        
        .file-upload input {
            display: none;
        }
        
        .file-upload-label {
            font-size: 1.2em;
            color: #ff6666;
        }
        
        .button {
            background: linear-gradient(90deg, #ff4444, #ff6666);
            color: #ffffff;
            border: none;
            padding: 15px 40px;
            font-size: 1.2em;
            cursor: pointer;
            border-radius: 5px;
            transition: all 0.3s ease;
            box-shadow: 0 0 20px rgba(255, 68, 68, 0.5);
        }
        
        .button:hover {
            transform: translateY(-2px);
            box-shadow: 0 0 40px rgba(255, 68, 68, 0.7);
        }
        
        .button:active {
            transform: translateY(0);
        }
        
        .button:disabled {
            background: #666666;
            cursor: not-allowed;
            box-shadow: none;
        }
        
        .output-area {
            width: 100%;
            min-height: 400px;
            background: #1a0000;
            border: 2px solid #ff4444;
            border-radius: 5px;
            color: #00ff00;
            padding: 15px;
            font-family: 'Courier New', monospace;
            font-size: 14px;
            resize: vertical;
            margin-top: 30px;
            white-space: pre-wrap;
            word-wrap: break-word;
        }
        
        .loading {
            text-align: center;
            color: #ff6666;
            font-size: 1.5em;
            margin-top: 20px;
            animation: pulse 1.5s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .error {
            color: #ff4444;
            background: rgba(255, 0, 0, 0.1);
            border: 1px solid #ff4444;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
        }
        
        .success {
            color: #00ff00;
            background: rgba(0, 255, 0, 0.1);
            border: 1px solid #00ff00;
            padding: 15px;
            border-radius: 5px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>⚡ PROMETHEUS DEOBFUSCATOR</h1>
        <p class="subtitle">Advanced Lua Script Deobfuscation Service</p>
        
        <div class="tabs">
            <div class="tab active" onclick="switchTab('file')">📁 File Upload</div>
            <div class="tab" onclick="switchTab('text')">📝 Text Input</div>
        </div>
        
        <div id="file-tab" class="tab-content active">
            <div class="file-upload" onclick="document.getElementById('fileInput').click()">
                <input type="file" id="fileInput" accept=".lua" onchange="handleFileSelect(event)">
                <div class="file-upload-label">
                    <div id="fileLabel">📂 Click to upload Lua file</div>
                </div>
            </div>
            <button class="button" onclick="deobfuscateFile()">🔓 Deobfuscate File</button>
        </div>
        
        <div id="text-tab" class="tab-content">
            <textarea class="input-area" id="codeInput" placeholder="Paste your Lua code here..."></textarea>
            <button class="button" onclick="deobfuscateText()">🔓 Deobfuscate Code</button>
        </div>
        
        <div id="loading" class="loading" style="display: none;">
            ⏳ Deobfuscating... This may take a moment...
        </div>
        
        <div id="error" class="error" style="display: none;"></div>
        
        <div id="success" class="success" style="display: none;"></div>
        
        <textarea class="output-area" id="output" placeholder="Deobfuscated code will appear here..." readonly></textarea>
    </div>
    
    <script>
        let selectedFile = null;
        
        function switchTab(tab) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            
            if (tab === 'file') {
                document.querySelectorAll('.tab')[0].classList.add('active');
                document.getElementById('file-tab').classList.add('active');
            } else {
                document.querySelectorAll('.tab')[1].classList.add('active');
                document.getElementById('text-tab').classList.add('active');
            }
        }
        
        function handleFileSelect(event) {
            selectedFile = event.target.files[0];
            if (selectedFile) {
                document.getElementById('fileLabel').textContent = '📄 ' + selectedFile.name;
            }
        }
        
        async function deobfuscateFile() {
            if (!selectedFile) {
                showError('Please select a file first');
                return;
            }
            
            showLoading(true);
            hideMessages();
            
            try {
                const formData = new FormData();
                formData.append('file', selectedFile);
                
                const response = await fetch('/deobfuscate', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('output').value = data.output;
                    showSuccess('Deobfuscation successful!');
                } else {
                    showError(data.error || 'Deobfuscation failed');
                }
            } catch (error) {
                showError('Error: ' + error.message);
            }
            
            showLoading(false);
        }
        
        async function deobfuscateText() {
            const code = document.getElementById('codeInput').value.trim();
            
            if (!code) {
                showError('Please enter some code first');
                return;
            }
            
            showLoading(true);
            hideMessages();
            
            try {
                const response = await fetch('/deobfuscate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ code: code })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('output').value = data.output;
                    showSuccess('Deobfuscation successful!');
                } else {
                    showError(data.error || 'Deobfuscation failed');
                }
            } catch (error) {
                showError('Error: ' + error.message);
            }
            
            showLoading(false);
        }
        
        function showLoading(show) {
            document.getElementById('loading').style.display = show ? 'block' : 'none';
        }
        
        function showError(message) {
            const errorDiv = document.getElementById('error');
            errorDiv.textContent = '❌ ' + message;
            errorDiv.style.display = 'block';
        }
        
        function showSuccess(message) {
            const successDiv = document.getElementById('success');
            successDiv.textContent = '✅ ' + message;
            successDiv.style.display = 'block';
        }
        
        function hideMessages() {
            document.getElementById('error').style.display = 'none';
            document.getElementById('success').style.display = 'none';
        }
    </script>
</body>
</html>`;
}
