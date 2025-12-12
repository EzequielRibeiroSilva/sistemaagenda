#!/usr/bin/env node

/**
 * Script de Teste de Compressão de Imagens
 * 
 * Testa a compressão de imagens com diferentes tamanhos e formatos
 * 
 * Uso:
 *   node scripts/test-image-compression.js [caminho-para-imagem]
 */

const { compressImageFromPath, getCompressionInfo } = require('../src/middleware/imageCompressionMiddleware');
const path = require('path');
const fs = require('fs');

console.log('\n========================================');
console.log('🖼️  TESTE DE COMPRESSÃO DE IMAGENS');
console.log('========================================\n');

// Obter configuração
const config = getCompressionInfo();
console.log('📋 Configuração:');
console.log(`   Tamanho máximo: ${config.maxWidth}x${config.maxHeight}px`);
console.log(`   Qualidade WebP: ${config.quality.webp}%`);
console.log(`   Qualidade JPEG: ${config.quality.jpeg}%`);
console.log(`   Formato de saída: ${config.outputFormat}`);
console.log(`   Formatos permitidos: ${config.allowedFormats.join(', ')}\n`);

// Verificar se foi fornecido um arquivo
const testFile = process.argv[2];

if (!testFile) {
  console.log('❌ Nenhum arquivo fornecido\n');
  console.log('📝 Uso:');
  console.log('   node scripts/test-image-compression.js caminho/para/imagem.jpg\n');
  console.log('💡 Exemplo:');
  console.log('   node scripts/test-image-compression.js uploads/avatars/agente_123.jpg\n');
  process.exit(1);
}

// Verificar se arquivo existe
if (!fs.existsSync(testFile)) {
  console.log(`❌ Arquivo não encontrado: ${testFile}\n`);
  process.exit(1);
}

// Testar compressão
async function testCompression() {
  try {
    console.log('🔄 Processando imagem...\n');
    
    const originalSize = fs.statSync(testFile).size;
    const originalFilename = path.basename(testFile);
    
    console.log('📊 Arquivo Original:');
    console.log(`   Nome: ${originalFilename}`);
    console.log(`   Tamanho: ${(originalSize / 1024).toFixed(2)} KB`);
    console.log(`   Caminho: ${testFile}\n`);
    
    // Comprimir
    const result = await compressImageFromPath(testFile, originalFilename);
    
    console.log('✅ Compressão Concluída!\n');
    console.log('📊 Arquivo Comprimido:');
    console.log(`   Nome: ${result.filename}`);
    console.log(`   Tamanho: ${(result.size / 1024).toFixed(2)} KB`);
    console.log(`   Formato: ${result.mimetype}`);
    console.log(`   URL: ${result.url}`);
    console.log(`   Caminho: ${result.path}\n`);
    
    const reduction = ((1 - result.size / originalSize) * 100).toFixed(2);
    console.log('📈 Estatísticas:');
    console.log(`   Redução de tamanho: ${reduction}%`);
    console.log(`   Economia de espaço: ${((originalSize - result.size) / 1024).toFixed(2)} KB\n`);
    
    if (reduction > 50) {
      console.log('🎉 Excelente compressão! Mais de 50% de redução.\n');
    } else if (reduction > 30) {
      console.log('✅ Boa compressão! Entre 30-50% de redução.\n');
    } else {
      console.log('ℹ️  Compressão moderada. Imagem já estava otimizada.\n');
    }
    
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Erro ao testar compressão:', error.message);
    console.error('\n📋 Stack trace:');
    console.error(error.stack);
    console.log('\n========================================\n');
    process.exit(1);
  }
}

testCompression();
