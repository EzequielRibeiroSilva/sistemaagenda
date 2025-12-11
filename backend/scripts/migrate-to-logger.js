#!/usr/bin/env node

/**
 * Script de Migração: console.* para logger
 * FASE 2.4 - Sanitizar Logs do Backend
 * 
 * Este script substitui automaticamente todas as ocorrências de console.log,
 * console.error, console.warn, etc. pelo logger sanitizado.
 */

const fs = require('fs');
const path = require('path');

// Diretório raiz do código fonte
const SRC_DIR = path.join(__dirname, '../src');

// Estatísticas
let stats = {
  filesProcessed: 0,
  filesModified: 0,
  replacements: {
    log: 0,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0
  },
  totalReplacements: 0
};

/**
 * Verificar se o arquivo já importa o logger
 * @param {string} content - Conteúdo do arquivo
 * @returns {boolean}
 */
function hasLoggerImport(content) {
  return content.includes("require('../utils/logger')") ||
         content.includes("require('./utils/logger')") ||
         content.includes("require('../../utils/logger')") ||
         content.includes("require('../../../utils/logger')");
}

/**
 * Adicionar import do logger no início do arquivo
 * @param {string} content - Conteúdo do arquivo
 * @param {string} relativePath - Caminho relativo para utils/logger
 * @returns {string} Conteúdo com import adicionado
 */
function addLoggerImport(content, relativePath) {
  // Encontrar a última linha de require
  const lines = content.split('\n');
  let lastRequireIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(') && !lines[i].trim().startsWith('//')) {
      lastRequireIndex = i;
    }
  }
  
  // Se encontrou requires, adicionar depois do último
  if (lastRequireIndex >= 0) {
    lines.splice(lastRequireIndex + 1, 0, `const logger = require('${relativePath}');`);
  } else {
    // Se não encontrou, adicionar no início (depois de comentários)
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('//') && !lines[i].trim().startsWith('/*') && !lines[i].trim().startsWith('*')) {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, `const logger = require('${relativePath}');`, '');
  }
  
  return lines.join('\n');
}

/**
 * Substituir console.* por logger.*
 * @param {string} content - Conteúdo do arquivo
 * @returns {Object} { content, replacements }
 */
function replaceConsole(content) {
  let modified = content;
  const replacements = {
    log: 0,
    error: 0,
    warn: 0,
    info: 0,
    debug: 0
  };
  
  // Substituir console.log por logger.log
  const logMatches = modified.match(/console\.log/g);
  if (logMatches) {
    replacements.log = logMatches.length;
    modified = modified.replace(/console\.log/g, 'logger.log');
  }
  
  // Substituir console.error por logger.error
  const errorMatches = modified.match(/console\.error/g);
  if (errorMatches) {
    replacements.error = errorMatches.length;
    modified = modified.replace(/console\.error/g, 'logger.error');
  }
  
  // Substituir console.warn por logger.warn
  const warnMatches = modified.match(/console\.warn/g);
  if (warnMatches) {
    replacements.warn = warnMatches.length;
    modified = modified.replace(/console\.warn/g, 'logger.warn');
  }
  
  // Substituir console.info por logger.info
  const infoMatches = modified.match(/console\.info/g);
  if (infoMatches) {
    replacements.info = infoMatches.length;
    modified = modified.replace(/console\.info/g, 'logger.info');
  }
  
  // Substituir console.debug por logger.debug
  const debugMatches = modified.match(/console\.debug/g);
  if (debugMatches) {
    replacements.debug = debugMatches.length;
    modified = modified.replace(/console\.debug/g, 'logger.debug');
  }
  
  return { content: modified, replacements };
}

/**
 * Calcular caminho relativo para utils/logger
 * @param {string} filePath - Caminho do arquivo
 * @returns {string} Caminho relativo
 */
function getLoggerPath(filePath) {
  const relativePath = path.relative(path.dirname(filePath), path.join(SRC_DIR, 'utils'));
  return `./${relativePath}/logger`.replace(/\\/g, '/');
}

/**
 * Processar um arquivo
 * @param {string} filePath - Caminho do arquivo
 */
function processFile(filePath) {
  try {
    // Ler conteúdo do arquivo
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar se tem console.*
    if (!content.includes('console.')) {
      return;
    }
    
    stats.filesProcessed++;
    
    // Substituir console por logger
    const { content: modifiedContent, replacements } = replaceConsole(content);
    
    // Se houve substituições
    const totalFileReplacements = Object.values(replacements).reduce((a, b) => a + b, 0);
    if (totalFileReplacements > 0) {
      // Adicionar import do logger se necessário
      let finalContent = modifiedContent;
      if (!hasLoggerImport(modifiedContent)) {
        const loggerPath = getLoggerPath(filePath);
        finalContent = addLoggerImport(modifiedContent, loggerPath);
      }
      
      // Salvar arquivo modificado
      fs.writeFileSync(filePath, finalContent, 'utf8');
      
      // Atualizar estatísticas
      stats.filesModified++;
      stats.replacements.log += replacements.log;
      stats.replacements.error += replacements.error;
      stats.replacements.warn += replacements.warn;
      stats.replacements.info += replacements.info;
      stats.replacements.debug += replacements.debug;
      stats.totalReplacements += totalFileReplacements;
      
      console.log(`✅ ${path.relative(SRC_DIR, filePath)}: ${totalFileReplacements} substituições`);
    }
  } catch (error) {
    console.error(`❌ Erro ao processar ${filePath}:`, error.message);
  }
}

/**
 * Processar diretório recursivamente
 * @param {string} dirPath - Caminho do diretório
 */
function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  
  for (const item of items) {
    const itemPath = path.join(dirPath, item);
    const stat = fs.statSync(itemPath);
    
    if (stat.isDirectory()) {
      // Ignorar node_modules e outros diretórios
      if (item !== 'node_modules' && item !== '.git') {
        processDirectory(itemPath);
      }
    } else if (stat.isFile() && item.endsWith('.js')) {
      // Processar apenas arquivos .js
      processFile(itemPath);
    }
  }
}

/**
 * Main
 */
function main() {
  console.log('🚀 Iniciando migração de console.* para logger...\n');
  console.log(`📁 Diretório: ${SRC_DIR}\n`);
  
  // Processar todos os arquivos
  processDirectory(SRC_DIR);
  
  // Exibir estatísticas
  console.log('\n' + '='.repeat(60));
  console.log('📊 ESTATÍSTICAS DA MIGRAÇÃO');
  console.log('='.repeat(60));
  console.log(`📄 Arquivos processados: ${stats.filesProcessed}`);
  console.log(`✏️  Arquivos modificados: ${stats.filesModified}`);
  console.log(`\n🔄 Substituições por tipo:`);
  console.log(`   - console.log   → logger.log:   ${stats.replacements.log}`);
  console.log(`   - console.error → logger.error: ${stats.replacements.error}`);
  console.log(`   - console.warn  → logger.warn:  ${stats.replacements.warn}`);
  console.log(`   - console.info  → logger.info:  ${stats.replacements.info}`);
  console.log(`   - console.debug → logger.debug: ${stats.replacements.debug}`);
  console.log(`\n✅ Total de substituições: ${stats.totalReplacements}`);
  console.log('='.repeat(60));
  console.log('\n✨ Migração concluída com sucesso!');
}

// Executar
main();
