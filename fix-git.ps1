# =============================================
# 🤖 PROJETO CHATGOHAN - LIMPEZA + DEPLOY + TESTE
# Autor: EZIEL gênio
# =============================================

Write-Host "`n🚀 Iniciando limpeza e reconfiguração do ChatGohan..." -ForegroundColor Cyan

# 1️⃣ Remover rastros do Git antigo
if (Test-Path ".git") {
    Write-Host "🧹 Removendo repositório Git antigo..."
    Remove-Item -Recurse -Force .git
} else {
    Write-Host "✅ Nenhum repositório Git antigo encontrado."
}

# 2️⃣ Remover pastas pesadas e Chromium
$pathsToRemove = @(
    "node_modules",
    ".local-chromium",
    "chromium",
    "node_modules/whatsapp-web.js/node_modules/puppeteer-core/.local-chromium",
    "node_modules/chromium"
)
foreach ($path in $pathsToRemove) {
    if (Test-Path $path) {
        Write-Host "🧨 Removendo $path..."
        Remove-Item -Recurse -Force $path
    }
}

# 3️⃣ Criar ou sobrescrever o .gitignore
Write-Host "📄 Criando novo .gitignore..."
$gitignoreContent = @"
# Dependências e builds
node_modules/
.local-chromium/
chromium/
dist/
build/
out/

# Cache e logs
.wwebjs_cache/
.wwebjs_auth/
logs/
*.log

# Sistema e IDE
.DS_Store
Thumbs.db
.env
"@
Set-Content -Path ".gitignore" -Value $gitignoreContent -Encoding UTF8

# 4️⃣ Reinstalar dependências
Write-Host "📦 Reinstalando dependências sem Chromium..."
npm install --ignore-scripts

# 5️⃣ Recriar repositório Git
Write-Host "🔧 Recriando repositório Git..."
git init
git add .
git commit -m "🚀 Versão limpa e otimizada do ChatGohan"
git branch -M main

# ✅ Atualize seu link abaixo com o link real do repositório
$remoteUrl = "https://github.com/ezielcosta/chatgohan.git"
git remote add origin $remoteUrl

# 6️⃣ Enviar para o GitHub
Write-Host "🌍 Enviando repositório limpo ao GitHub..."
git push -u origin main --force

# 7️⃣ Testar o bot (iniciar servidor)
Write-Host "`n🤖 Testando ChatGohan..."
if (Test-Path "index.js") {
    node index.js
} elseif (Test-Path "server.js") {
    node server.js
} else {
    Write-Host "⚠️ Nenhum arquivo de inicialização (index.js ou server.js) encontrado!"
}

Write-Host "`n✅ Processo concluído com sucesso!" -ForegroundColor Green
# =============================================
# 🤖 PROJETO CHATGOHAN - LIMPEZA + DEPLOY + TESTE
# Autor: EZIEL gênio
# =============================================

Write-Host "`n🚀 Iniciando limpeza e reconfiguração do ChatGohan..." -ForegroundColor Cyan

# 1️⃣ Remover rastros do Git antigo
if (Test-Path ".git") {
    Write-Host "🧹 Removendo repositório Git antigo..."
    Remove-Item -Recurse -Force .git
} else {
    Write-Host "✅ Nenhum repositório Git antigo encontrado."
}

# 2️⃣ Remover pastas pesadas e Chromium
$pathsToRemove = @(
    "node_modules",
    ".local-chromium",
    "chromium",
    "node_modules/whatsapp-web.js/node_modules/puppeteer-core/.local-chromium",
    "node_modules/chromium"
)
foreach ($path in $pathsToRemove) {
    if (Test-Path $path) {
        Write-Host "🧨 Removendo $path..."
        Remove-Item -Recurse -Force $path
    }
}

# 3️⃣ Criar ou sobrescrever o .gitignore
Write-Host "📄 Criando novo .gitignore..."
$gitignoreContent = @"
# Dependências e builds
node_modules/
.local-chromium/
chromium/
dist/
build/
out/

# Cache e logs
.wwebjs_cache/
.wwebjs_auth/
logs/
*.log

# Sistema e IDE
.DS_Store
Thumbs.db
.env
"@
Set-Content -Path ".gitignore" -Value $gitignoreContent -Encoding UTF8

# 4️⃣ Reinstalar dependências
Write-Host "📦 Reinstalando dependências sem Chromium..."
npm install --ignore-scripts

# 5️⃣ Recriar repositório Git
Write-Host "🔧 Recriando repositório Git..."
git init
git add .
git commit -m "🚀 Versão limpa e otimizada do ChatGohan"
git branch -M main

# ✅ Atualize seu link abaixo com o link real do repositório
$remoteUrl = "https://github.com/ezielcosta/chatgohan.git"
git remote add origin $remoteUrl

# 6️⃣ Enviar para o GitHub
Write-Host "🌍 Enviando repositório limpo ao GitHub..."
git push -u origin main --force

# 7️⃣ Testar o bot (iniciar servidor)
Write-Host "`n🤖 Testando ChatGohan..."
if (Test-Path "index.js") {
    node index.js
} elseif (Test-Path "server.js") {
    node server.js
} else {
    Write-Host "⚠️ Nenhum arquivo de inicialização (index.js ou server.js) encontrado!"
}

Write-Host "`n✅ Processo concluído com sucesso!" -ForegroundColor Green
