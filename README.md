<img width="605" height="353" alt="Screenshot" src="https://github.com/ollxel/ColAI/blob/e43b2b9d1c76448a2e083264c7b2dec09b43a596/image1" />

Russian README - [README_RU.md](README_RU.md)

# ColAI - Collaborative AI Ecosystem

ColAI is a fully offline platform for collaborative work of multiple neural networks. The system allows multiple AI models to communicate with each other, play games (such as Mafia), discuss projects and work together using local Ollama models.

## Key Features

- **Collaborative Mode**: Up to 8 specialized neural networks work together on any topic
- **Mafia Mode**: AI players participate in Mafia game with realistic behavior
- **Fully Offline**: Everything works locally through Ollama, no dependency on external APIs
- **Flexible Model Configuration**: Choice of any Ollama model at startup
- **Multimodality**: Support for image and document uploads
- **Live Chat**: Dynamic communication between networks with initiative and fragmented messages

## System Requirements

### Minimum Requirements:
- **OS**: Windows 10/11, macOS 10.15+, Linux (Ubuntu 20.04+)
- **RAM**: 8 GB (16 GB recommended for large models)
- **Storage**: 20 GB free space (for models)
- **CPU**: Modern processor with AVX2 support
- **GPU**: Optional, but NVIDIA GPU with 6+ GB VRAM recommended for better performance

### Recommended Requirements:
- **RAM**: 32 GB
- **GPU**: NVIDIA RTX 3060 or better (12+ GB VRAM)
- **Storage**: 50+ GB SSD

## Installation

### Step 1: Install Node.js

1. Download Node.js from the [official website](https://nodejs.org/)
2. Install the LTS version (18.x or higher recommended)
3. Verify installation:
```bash
node --version
npm --version
```

### Step 2: Install Ollama

**Windows:**
1. Download the installer from [ollama.ai](https://ollama.ai/download)
2. Run the installer and follow instructions
3. Ollama will be automatically added to PATH

**macOS:**
```bash
brew install ollama
# or download from ollama.ai
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Step 3: Start Ollama

Open terminal and run:
```bash
ollama serve
```

Ollama will be available at http://localhost:11434

**Important:** Ollama must be running before using ColAI!

### Step 4: Download Models

Recommended models for ColAI:
```bash
# Main model (recommended)
ollama pull qwen2.5:14b

# Alternative models
ollama pull llama3.2:3b        # Lightweight model for weak PCs
ollama pull deepseek-r1        # For analytical tasks
ollama pull gemma2:2b          # For Mafia games
ollama pull mistral:7b         # Universal model
```

Note: The qwen2.5:14b model requires ~8 GB RAM. For systems with less memory, use qwen2.5:7b or llama3.2:3b.

### Step 5: Install ColAI

1. Extract the project archive
2. Open terminal in the project folder
3. Install dependencies (if required):
```bash
npm install
```

Note: ColAI uses native ES modules and can work without npm by opening index.html directly in the browser. However, for better compatibility, using a local server is recommended.

### Step 6: Start Local Server (Optional)

To run via local server, from the project root:
```bash
# Using Python (if installed) — serve from ColAI-master
cd ColAI-master && python -m http.server 8000

# Or using Node.js http-server
cd ColAI-master && npx http-server -p 8000

# Or using PHP
cd ColAI-master && php -S localhost:8000
```

Then open in browser: http://localhost:8000

Alternative: Open **ColAI-master/index.html** directly in the browser (Chrome, Firefox, Edge).

## Usage

### First Launch

1. Ensure Ollama is running: `ollama serve`
2. Open ColAI in browser (ColAI-master/index.html or via local server)
3. Configure model:
   - In the "Ollama Model" field, enter the model name (e.g.: qwen2.5:14b)
   - Click "Check Connection" to verify Ollama availability
   - Ensure the model is downloaded: `ollama pull qwen2.5:14b`
4. Start working:
   - Enter project name
   - Describe discussion topic
   - Configure parameters (temperature, tokens, etc.)
   - Click "Start Collaboration"

<img width="605" height="353" alt="Screenshot" src="https://github.com/ollxel/ColAI/blob/e43b2b9d1c76448a2e083264c7b2dec09b43a596/image2" />

### Collaborative Mode

1. **Project Setup**: Enter project name, describe topic, upload files if needed (images, PDF, text)
2. **Network Selection**: Select which neural networks participate (up to 8)
3. **Parameter Configuration**: Temperature, Max Tokens, Top P, Iterations
4. **Start Discussion**: Networks discuss in turns, summaries are created, process repeats

### Mafia Mode

1. Navigate to Mafia mode through navigation menu
2. Configure game: players (4–8), mafia count, discussion rounds, language
3. Click "Start Game"
4. Game proceeds through day and night phases

## Configuration

### Model Selection

Examples: qwen2.5:14b, qwen2.5:7b, llama3.2:3b, deepseek-r1, mistral:7b  
The model is saved in localStorage.

### Model Settings

- System Prompt Template, Temperature (0.0–2.0), Max Tokens, Top P
- Presence Penalty, Frequency Penalty

## Troubleshooting

**Ollama not connecting:** Run `ollama serve`, check http://localhost:11434/api/tags  
**Model not found:** `ollama list`, `ollama pull <model_name>`  
**Slow performance:** Use smaller model, decrease max_tokens, use fewer networks  
**CORS errors:** Use local server, not file://

## Project Structure

```
ColAI-master/
├── app.js              # Main application
├── index.html          # HTML interface
├── styles.css          # Styles
├── darkModeManager.js  # Dark theme
└── modules/
    ├── framework.js    # Main framework
    ├── networkManager.js
    ├── ollamaManager.js
    ├── mafiaMode.js
    └── ...
```

## License

See LICENSE file in project root.

## Support

1. Check the Troubleshooting section
2. Ensure Ollama is installed and running
3. Check that model is downloaded: `ollama list`
4. Check browser logs (F12 → Console)

---

Enjoy using ColAI! 🚀
