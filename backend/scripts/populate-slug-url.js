/**
 * Script: Popular slug_url nas unidades existentes
 * Descrição: Gera slugs únicos baseados no nome de cada unidade
 */

const knex = require('knex');
const knexConfig = require('../knexfile');

const db = knex(knexConfig.development);

// Função para gerar slug a partir do nome
function generateSlug(nome) {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s-]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '-') // Substitui espaços por hífens
    .replace(/-+/g, '-') // Remove hífens duplicados
    .trim('-'); // Remove hífens do início e fim
}

async function populateSlugUrl() {
  try {
    console.log('🔄 Iniciando população de slug_url...\n');

    // Buscar todas as unidades
    const unidades = await db('unidades').select('id', 'nome', 'slug_url');

    console.log(`📊 Encontradas ${unidades.length} unidades\n`);

    for (const unidade of unidades) {
      if (!unidade.slug_url) {
        let slug = generateSlug(unidade.nome);
        let counter = 1;

        // Verificar se o slug já existe
        let slugExists = await db('unidades')
          .where('slug_url', slug)
          .whereNot('id', unidade.id)
          .first();

        // Se existe, adicionar número ao final
        while (slugExists) {
          slug = `${generateSlug(unidade.nome)}-${counter}`;
          counter++;
          slugExists = await db('unidades')
            .where('slug_url', slug)
            .whereNot('id', unidade.id)
            .first();
        }

        // Atualizar a unidade com o slug
        await db('unidades')
          .where('id', unidade.id)
          .update({ slug_url: slug });

        console.log(`✅ Unidade #${unidade.id} "${unidade.nome}" → slug: "${slug}"`);
      } else {
        console.log(`⏭️  Unidade #${unidade.id} "${unidade.nome}" já tem slug: "${unidade.slug_url}"`);
      }
    }

    console.log('\n✅ População de slug_url concluída com sucesso!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao popular slug_url:', error);
    process.exit(1);
  }
}

populateSlugUrl();
