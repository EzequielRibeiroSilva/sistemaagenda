const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuração do storage para arquivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Gerar nome único: agente_[timestamp]_[random].[ext]
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `agente_${uniqueSuffix}${extension}`);
  }
});

// Filtro de arquivos (apenas imagens)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não permitido. Use apenas: JPEG, PNG, GIF ou WebP'), false);
  }
};

// Configuração do multer apenas para arquivos
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 1 // Apenas 1 arquivo por vez
  },
  fileFilter: fileFilter
});

// Middleware que processa FormData completo
const handleFormDataWithUpload = (req, res, next) => {


  // Verificar se é FormData
  if (!req.headers['content-type'] || !req.headers['content-type'].includes('multipart/form-data')) {

    return next();
  }

  // Usar busboy para processar FormData manualmente
  const busboy = require('busboy');

  try {
    const bb = busboy({ headers: req.headers });
    const fields = {};
    const files = [];
    let fileProcessing = false;

    bb.on('field', (fieldname, val) => {
      fields[fieldname] = val;
    });

    bb.on('file', (fieldname, file, info) => {
      if (fieldname === 'avatar') {
        fileProcessing = true;

        // Processar upload de avatar
        const { filename, encoding, mimeType } = info;

        // Validar tipo de arquivo
        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(mimeType)) {
          file.resume(); // Consumir o stream
          return res.status(400).json({
            success: false,
            error: 'Tipo de arquivo não permitido',
            message: 'Use apenas: JPEG, PNG, GIF ou WebP'
          });
        }

        // Gerar nome único
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const extension = path.extname(filename);
        const newFilename = `agente_${uniqueSuffix}${extension}`;
        const filePath = path.join(uploadsDir, newFilename);

        // Salvar arquivo
        const writeStream = fs.createWriteStream(filePath);
        file.pipe(writeStream);

        writeStream.on('close', () => {
          req.avatarUrl = `/uploads/avatars/${newFilename}`;
          files.push({
            fieldname,
            filename: newFilename,
            originalname: filename,
            mimetype: mimeType,
            path: filePath
          });
          fileProcessing = false;
        });

        writeStream.on('error', (err) => {
          console.error('Erro ao salvar arquivo:', err);
          fileProcessing = false;
          return res.status(500).json({
            success: false,
            error: 'Erro ao salvar arquivo',
            message: err.message
          });
        });
      } else {
        // Ignorar outros arquivos
        file.resume();
      }
    });

    bb.on('close', () => {
      // Aguardar processamento de arquivos se necessário
      const checkAndProceed = () => {
        if (fileProcessing) {
          setTimeout(checkAndProceed, 10);
          return;
        }

        // Adicionar campos ao req.body
        req.body = fields;
        req.files = files;



        next();
      };

      checkAndProceed();
    });

    bb.on('error', (err) => {
      console.error('Erro no busboy:', err);
      return res.status(400).json({
        success: false,
        error: 'Erro no processamento',
        message: err.message
      });
    });

    req.pipe(bb);

  } catch (err) {
    console.error('Erro no middleware FormData:', err);
    return res.status(500).json({
      success: false,
      error: 'Erro interno',
      message: err.message
    });
  }
};


// Função para deletar arquivo antigo
const deleteOldAvatar = (avatarUrl) => {
  if (!avatarUrl) {
    return; // Não deletar se não há URL
  }
  
  try {
    const filename = path.basename(avatarUrl);
    const filePath = path.join(uploadsDir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`Avatar antigo deletado: ${filename}`);
    }
  } catch (error) {
    console.error('Erro ao deletar avatar antigo:', error);
  }
};

module.exports = {
  handleFormDataWithUpload,
  deleteOldAvatar,
  uploadsDir
};
