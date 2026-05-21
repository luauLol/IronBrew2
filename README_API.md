# Prometheus Deobfuscator API

**API Endpoint:** `https://prometheus-deobf-fade.l11.store/`

## API Endpoints

### Deobfuscate (File Upload)
```
POST /deobfuscate
Content-Type: multipart/form-data

file: <lua file>
```

**Response:**
```json
{
  "success": true,
  "output": "<deobfuscated lua code>"
}
```

### Deobfuscate (Text/Code)
```
POST /deobfuscate
Content-Type: application/json

{
  "code": "<lua code string>"
}
```

**Response:**
```json
{
  "success": true,
  "output": "<deobfuscated lua code>"
}
```

## Usage Examples

### Using curl (File):
```bash
curl -X POST -F "file=@input.lua" https://prometheus-deobf-fade.l11.store/deobfuscate
```

### Using curl (Text):
```bash
curl -X POST -H "Content-Type: application/json" -d '{"code":"local x = 1"}' https://prometheus-deobf-fade.l11.store/deobfuscate
```

### Using JavaScript (File):
```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

fetch('https://prometheus-deobf-fade.l11.store/deobfuscate', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log(data.output);
});
```

### Using JavaScript (Text):
```javascript
fetch('https://prometheus-deobf-fade.l11.store/deobfuscate', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    code: 'local x = 1'
  })
})
.then(response => response.json())
.then(data => {
  console.log(data.output);
});
```

### Using Python (File):
```python
import requests

with open('input.lua', 'rb') as f:
    files = {'file': f}
    response = requests.post('https://prometheus-deobf-fade.l11.store/deobfuscate', files=files)
    print(response.json()['output'])
```

### Using Python (Text):
```python
import requests

response = requests.post('https://prometheus-deobf-fade.l11.store/deobfuscate', json={
    'code': 'local x = 1'
})
print(response.json()['output'])
```
