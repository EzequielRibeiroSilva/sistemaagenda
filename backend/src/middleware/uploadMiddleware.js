const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Criar diretório de uploads se não existir
const uploadsDir = path.join(__dirname, '../../uploads/avatars');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuração do storage
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

// Configuração do multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
    files: 1 // Apenas 1 arquivo por vez
  },
  fileFilter: fileFilter
});

// Middleware para upload de avatar
const uploadAvatar = upload.single('avatar');

// Middleware wrapper com tratamento de erro
const handleAvatarUpload = (req, res, next) => {
  uploadAvatar(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'Arquivo muito grande',
          message: 'O arquivo deve ter no máximo 5MB'
        });
      }
      if (err.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({
          success: false,
          error: 'Muitos arquivos',
          message: 'Envie apenas um arquivo por vez'
        });
      }
      return res.status(400).json({
        success: false,
        error: 'Erro no upload',
        message: err.message
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: 'Erro no upload',
        message: err.message
      });
    }
    
    // Se há arquivo, adicionar URL ao req
    if (req.file) {
      // URL relativa que será servida pelo express.static
      req.avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }
    
    next();
  });
};

// Função para deletar arquivo antigo
const deleteOldAvatar = (avatarUrl) => {
  if (!avatarUrl || avatarUrl.includes('pravatar.cc')) {
    return; // Não deletar avatars padrão
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
  handleAvatarUpload,
  deleteOldAvatar,
  uploadsDir
};
