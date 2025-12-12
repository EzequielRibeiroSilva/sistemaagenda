/**
 * Middleware de Compressão de Imagens
 * 
 * ITEM 5/7 - PRÉ-PRODUÇÃO
 * 
 * Funcionalidades:
 * - Compressão automática de imagens
 * - Redimensionamento inteligente
 * - Conversão para WebP (formato moderno)
 * - Preservação de qualidade visual
 * - Redução de tamanho de arquivo (até 80%)
 * 
 * Tecnologia: Sharp (biblioteca de alta performance)
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Configurações de compressão
const COMPRESSION_CONFIG = {
  // Tamanho máximo para avatares (largura)
  maxWidth: 800,
  maxHeight: 800,
  
  // Qualidade de compressão (0-100)
  quality: {
    webp: 85,    // WebP - formato moderno
    jpeg: 85,    // JPEG - fallback
    png: 90      // PNG - para transparência
  },
  
  // Formatos permitidos
  allowedFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp'],
  
  // Formato de saída preferido
  outputFormat: 'webp'
};

/**
 * Middleware de compressão de imagens
 * 
 * Processa imagens após upload do multer/busboy
 * Comprime e otimiza automaticamente
 */
const compressImage = async (req, res, next) => {
  try {
    // Verificar se há arquivo de avatar para processar
    if (!req.files || !req.files.avatar || !req.files.avatar[0]) {
      // Sem arquivo, prosseguir
      return next();
    }

    const file = req.files.avatar[0];
    const originalPath = file.path;
    const originalSize = fs.statSync(originalPath).size;

    logger.log(`📸 [ImageCompression] Processando imagem: ${file.filename}`);
    logger.log(`   Tamanho original: ${(originalSize / 1024).toFixed(2)} KB`);
    logger.log(`   Formato original: ${file.mimetype}`);

    // Verificar se é uma imagem válida
    if (!file.mimetype.startsWith('image/')) {
      logger.warn(`⚠️  [ImageCompression] Arquivo não é imagem: ${file.mimetype}`);
      return next();
    }

    // Gerar nome do arquivo comprimido
    const ext = path.extname(file.filename);
    const basename = path.basename(file.filename, ext);
    const compressedFilename = `${basename}.webp`; // Sempre converter para WebP
    const compressedPath = path.join(path.dirname(originalPath), compressedFilename);

    // Processar imagem com Sharp
    const image = sharp(originalPath);
    
    // Obter metadados da imagem
    const metadata = await image.metadata();
    logger.log(`   Dimensões originais: ${metadata.width}x${metadata.height}`);

    // Configurar pipeline de processamento
    let pipeline = image;

    // Redimensionar se necessário (manter proporção)
    if (metadata.width > COMPRESSION_CONFIG.maxWidth || metadata.height > COMPRESSION_CONFIG.maxHeight) {
      pipeline = pipeline.resize(COMPRESSION_CONFIG.maxWidth, COMPRESSION_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
      logger.log(`   ✂️  Redimensionando para max ${COMPRESSION_CONFIG.maxWidth}x${COMPRESSION_CONFIG.maxHeight}`);
    }

    // Converter para WebP e comprimir
    pipeline = pipeline.webp({
      quality: COMPRESSION_CONFIG.quality.webp,
      effort: 6 // Nível de esforço de compressão (0-6, maior = melhor compressão)
    });

    // Salvar imagem comprimida
    await pipeline.toFile(compressedPath);

    // Obter tamanho do arquivo comprimido
    const compressedSize = fs.statSync(compressedPath).size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(2);

    logger.log(`   ✅ Compressão concluída!`);
    logger.log(`   Tamanho final: ${(compressedSize / 1024).toFixed(2)} KB`);
    logger.log(`   Redução: ${reduction}%`);

    // Deletar arquivo original
    try {
      fs.unlinkSync(originalPath);
      logger.log(`   🗑️  Arquivo original deletado`);
    } catch (err) {
      logger.warn(`   ⚠️  Erro ao deletar original: ${err.message}`);
    }

    // Atualizar informações do arquivo no request
    req.files.avatar[0].filename = compressedFilename;
    req.files.avatar[0].path = compressedPath;
    req.files.avatar[0].size = compressedSize;
    req.files.avatar[0].mimetype = 'image/webp';
    
    // Atualizar URL do avatar
    req.avatarUrl = `/uploads/avatars/${compressedFilename}`;

    logger.log(`   📦 Avatar URL atualizada: ${req.avatarUrl}`);

    next();

  } catch (error) {
    logger.error('❌ [ImageCompression] Erro ao comprimir imagem:', error);
    
    // Em caso de erro, prosseguir sem compressão
    // (melhor ter imagem grande do que falhar o upload)
    logger.warn('⚠️  [ImageCompression] Prosseguindo sem compressão');
    next();
  }
};

/**
 * Middleware de compressão para busboy (FormData manual)
 * 
 * Usado quando o upload é processado manualmente com busboy
 */
const compressImageFromPath = async (filePath, originalFilename) => {
  try {
    const originalSize = fs.statSync(filePath).size;

    logger.log(`📸 [ImageCompression] Processando imagem: ${originalFilename}`);
    logger.log(`   Tamanho original: ${(originalSize / 1024).toFixed(2)} KB`);

    // Gerar nome do arquivo comprimido
    const ext = path.extname(originalFilename);
    const basename = path.basename(originalFilename, ext);
    const compressedFilename = `${basename}.webp`;
    const compressedPath = path.join(path.dirname(filePath), compressedFilename);

    // Processar imagem com Sharp
    const image = sharp(filePath);
    const metadata = await image.metadata();

    logger.log(`   Dimensões originais: ${metadata.width}x${metadata.height}`);

    // Configurar pipeline
    let pipeline = image;

    // Redimensionar se necessário
    if (metadata.width > COMPRESSION_CONFIG.maxWidth || metadata.height > COMPRESSION_CONFIG.maxHeight) {
      pipeline = pipeline.resize(COMPRESSION_CONFIG.maxWidth, COMPRESSION_CONFIG.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true
      });
      logger.log(`   ✂️  Redimensionando para max ${COMPRESSION_CONFIG.maxWidth}x${COMPRESSION_CONFIG.maxHeight}`);
    }

    // Converter para WebP
    pipeline = pipeline.webp({
      quality: COMPRESSION_CONFIG.quality.webp,
      effort: 6
    });

    // Salvar
    await pipeline.toFile(compressedPath);

    const compressedSize = fs.statSync(compressedPath).size;
    const reduction = ((1 - compressedSize / originalSize) * 100).toFixed(2);

    logger.log(`   ✅ Compressão concluída!`);
    logger.log(`   Tamanho final: ${(compressedSize / 1024).toFixed(2)} KB`);
    logger.log(`   Redução: ${reduction}%`);

    // Deletar original
    try {
      fs.unlinkSync(filePath);
      logger.log(`   🗑️  Arquivo original deletado`);
    } catch (err) {
      logger.warn(`   ⚠️  Erro ao deletar original: ${err.message}`);
    }

    return {
      filename: compressedFilename,
      path: compressedPath,
      size: compressedSize,
      mimetype: 'image/webp',
      url: `/uploads/avatars/${compressedFilename}`
    };

  } catch (error) {
    logger.error('❌ [ImageCompression] Erro ao comprimir imagem:', error);
    
    // Retornar arquivo original em caso de erro
    return {
      filename: originalFilename,
      path: filePath,
      size: fs.statSync(filePath).size,
      mimetype: 'image/jpeg',
      url: `/uploads/avatars/${originalFilename}`
    };
  }
};

/**
 * Obter informações sobre a configuração de compressão
 */
const getCompressionInfo = () => {
  return {
    maxWidth: COMPRESSION_CONFIG.maxWidth,
    maxHeight: COMPRESSION_CONFIG.maxHeight,
    quality: COMPRESSION_CONFIG.quality,
    outputFormat: COMPRESSION_CONFIG.outputFormat,
    allowedFormats: COMPRESSION_CONFIG.allowedFormats
  };
};

module.exports = {
  compressImage,
  compressImageFromPath,
  getCompressionInfo,
  COMPRESSION_CONFIG
};
