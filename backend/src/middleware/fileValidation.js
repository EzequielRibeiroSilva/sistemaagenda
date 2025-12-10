/**
 * Middleware: File Validation
 * Descrição: Validação de magic bytes para prevenir upload de arquivos maliciosos
 * ✅ CORREÇÃO 1.5: Validar assinatura binária real dos arquivos
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Magic bytes (assinaturas binárias) de formatos de imagem permitidos
 * Referência: https://en.wikipedia.org/wiki/List_of_file_signatures
 */
const MAGIC_BYTES = {
  // JPEG
  'ffd8ffe0': { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', name: 'JPEG' },
  'ffd8ffe1': { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', name: 'JPEG' },
  'ffd8ffe2': { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', name: 'JPEG' },
  'ffd8ffe3': { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', name: 'JPEG' },
  'ffd8ffe8': { ext: ['.jpg', '.jpeg'], mime: 'image/jpeg', name: 'JPEG' },
  
  // PNG
  '89504e47': { ext: ['.png'], mime: 'image/png', name: 'PNG' },
  
  // GIF
  '47494638': { ext: ['.gif'], mime: 'image/gif', name: 'GIF' },
  
  // WebP
  '52494646': { ext: ['.webp'], mime: 'image/webp', name: 'WebP' }, // RIFF header (precisa validar WEBP depois)
  
  // BMP
  '424d': { ext: ['.bmp'], mime: 'image/bmp', name: 'BMP' }
};

/**
 * Lê os primeiros bytes de um arquivo para identificar o tipo real
 * @param {string} filePath - Caminho do arquivo
 * @param {number} bytesToRead - Número de bytes a ler (padrão: 12)
 * @returns {Promise<string>} - Hex string dos bytes lidos
 */
async function readMagicBytes(filePath, bytesToRead = 12) {
  try {
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    await fileHandle.read(buffer, 0, bytesToRead, 0);
    await fileHandle.close();
    
    return buffer.toString('hex');
  } catch (error) {
    console.error(`❌ [FileValidation] Erro ao ler magic bytes: ${error.message}`);
    throw new Error('Não foi possível ler o arquivo');
  }
}

/**
 * Valida se o arquivo é realmente uma imagem através dos magic bytes
 * @param {string} filePath - Caminho do arquivo
 * @param {string} declaredMimeType - MIME type declarado pelo cliente
 * @returns {Promise<Object>} - { valid: boolean, detectedType: string, message: string }
 */
async function validateImageMagicBytes(filePath, declaredMimeType) {
  try {
    // Ler primeiros 12 bytes do arquivo
    const hexString = await readMagicBytes(filePath);
    
    // Verificar magic bytes conhecidos
    let detectedFormat = null;
    
    for (const [signature, format] of Object.entries(MAGIC_BYTES)) {
      if (hexString.startsWith(signature)) {
        detectedFormat = format;
        break;
      }
    }
    
    // Se não detectou nenhum formato conhecido
    if (!detectedFormat) {
      console.warn(`🚨 [FileValidation] Magic bytes não reconhecidos: ${hexString.substring(0, 16)}`);
      return {
        valid: false,
        detectedType: 'unknown',
        message: 'Arquivo não é uma imagem válida (assinatura binária desconhecida)'
      };
    }
    
    // Validação adicional para WebP (verificar se realmente é WebP)
    if (hexString.startsWith('52494646')) { // RIFF
      const webpSignature = hexString.substring(16, 24); // Bytes 8-11
      if (webpSignature !== '57454250') { // "WEBP" em hex
        console.warn(`🚨 [FileValidation] Arquivo RIFF mas não é WebP: ${hexString.substring(0, 24)}`);
        return {
          valid: false,
          detectedType: 'riff-not-webp',
          message: 'Arquivo RIFF não é WebP válido'
        };
      }
    }
    
    // Verificar se o MIME type declarado corresponde ao detectado
    if (declaredMimeType && declaredMimeType !== detectedFormat.mime) {
      console.warn(`🚨 [FileValidation] MIME type não corresponde: declarado=${declaredMimeType}, detectado=${detectedFormat.mime}`);
      return {
        valid: false,
        detectedType: detectedFormat.name,
        message: `Tipo de arquivo não corresponde: declarado como ${declaredMimeType}, mas é ${detectedFormat.name}`
      };
    }
    
    // Validação bem-sucedida
    console.log(`✅ [FileValidation] Arquivo validado: ${detectedFormat.name} (${detectedFormat.mime})`);
    return {
      valid: true,
      detectedType: detectedFormat.name,
      mime: detectedFormat.mime,
      message: 'Arquivo válido'
    };
    
  } catch (error) {
    console.error(`❌ [FileValidation] Erro na validação: ${error.message}`);
    return {
      valid: false,
      detectedType: 'error',
      message: `Erro ao validar arquivo: ${error.message}`
    };
  }
}

/**
 * Middleware Express para validar magic bytes de arquivos enviados
 * ✅ CORREÇÃO 1.5: Aplicar após multer processar o upload
 */
const validateUploadedFile = async (req, res, next) => {
  try {
    // Se não há arquivo, pular validação
    if (!req.file) {
      return next();
    }
    
    const { path: filePath, mimetype, originalname } = req.file;
    
    console.log(`🔍 [FileValidation] Validando arquivo: ${originalname} (${mimetype})`);
    
    // Validar magic bytes
    const validation = await validateImageMagicBytes(filePath, mimetype);
    
    if (!validation.valid) {
      // Deletar arquivo inválido
      try {
        await fs.unlink(filePath);
        console.log(`🗑️ [FileValidation] Arquivo inválido deletado: ${originalname}`);
      } catch (unlinkError) {
        console.error(`❌ [FileValidation] Erro ao deletar arquivo: ${unlinkError.message}`);
      }
      
      // Retornar erro
      return res.status(400).json({
        success: false,
        error: 'Arquivo inválido',
        message: validation.message,
        details: {
          filename: originalname,
          declaredType: mimetype,
          detectedType: validation.detectedType
        }
      });
    }
    
    // Adicionar informações de validação ao request
    req.file.validated = true;
    req.file.detectedType = validation.detectedType;
    req.file.detectedMime = validation.mime;
    
    console.log(`✅ [FileValidation] Arquivo validado com sucesso: ${originalname}`);
    next();
    
  } catch (error) {
    console.error(`❌ [FileValidation] Erro no middleware: ${error.message}`);
    
    // Deletar arquivo se houver erro
    if (req.file && req.file.path) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error(`❌ [FileValidation] Erro ao deletar arquivo: ${unlinkError.message}`);
      }
    }
    
    return res.status(500).json({
      success: false,
      error: 'Erro na validação do arquivo',
      message: error.message
    });
  }
};

/**
 * Validação de magic bytes para uso direto (sem Express)
 * Útil para validações em serviços ou jobs
 */
async function validateFile(filePath, expectedMimeType = null) {
  return await validateImageMagicBytes(filePath, expectedMimeType);
}

/**
 * Middleware para validar arquivos do busboy (usado em formDataMiddleware)
 * ✅ CORREÇÃO 1.5: Compatível com req.files ao invés de req.file
 */
const validateBusboyFiles = async (req, res, next) => {
  try {
    // Se não há arquivos, pular validação
    if (!req.files || req.files.length === 0) {
      return next();
    }
    
    // Validar cada arquivo
    for (const file of req.files) {
      const { path: filePath, mimetype, originalname } = file;
      
      console.log(`🔍 [FileValidation] Validando arquivo: ${originalname} (${mimetype})`);
      
      // Validar magic bytes
      const validation = await validateImageMagicBytes(filePath, mimetype);
      
      if (!validation.valid) {
        // Deletar arquivo inválido
        try {
          await fs.unlink(filePath);
          console.log(`🗑️ [FileValidation] Arquivo inválido deletado: ${originalname}`);
        } catch (unlinkError) {
          console.error(`❌ [FileValidation] Erro ao deletar arquivo: ${unlinkError.message}`);
        }
        
        // Retornar erro
        return res.status(400).json({
          success: false,
          error: 'Arquivo inválido',
          message: validation.message,
          details: {
            filename: originalname,
            declaredType: mimetype,
            detectedType: validation.detectedType
          }
        });
      }
      
      // Adicionar informações de validação ao arquivo
      file.validated = true;
      file.detectedType = validation.detectedType;
      file.detectedMime = validation.mime;
      
      console.log(`✅ [FileValidation] Arquivo validado com sucesso: ${originalname}`);
    }
    
    next();
    
  } catch (error) {
    console.error(`❌ [FileValidation] Erro no middleware: ${error.message}`);
    
    // Deletar arquivos se houver erro
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          await fs.unlink(file.path);
        } catch (unlinkError) {
          console.error(`❌ [FileValidation] Erro ao deletar arquivo: ${unlinkError.message}`);
        }
      }
    }
    
    return res.status(500).json({
      success: false,
      error: 'Erro na validação do arquivo',
      message: error.message
    });
  }
};

module.exports = {
  validateUploadedFile,
  validateBusboyFiles,
  validateFile,
  validateImageMagicBytes,
  readMagicBytes,
  MAGIC_BYTES
};
