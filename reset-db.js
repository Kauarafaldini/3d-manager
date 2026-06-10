const { conectarBanco, getVendaModel, getEstoqueModel, getModeloModel, getCustoItemModel } = require('./db');
const mongoose = require('mongoose');

console.log('⚠️  ATENÇÃO: Isso vai deletar TODOS os dados do banco 3dmanager!');
console.log('=============================================');

async function resetDatabase() {
    try {
        console.log('Conectando ao MongoDB...');
        await conectarBanco();
        console.log('Conectado com sucesso!');

        // Deletar todas as coleções
        console.log('\n🗑️  Deletando coleções...');
        
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        
        for (const collection of collections) {
            console.log(`   Deletando coleção: ${collection.name}`);
            await db.collection(collection.name).deleteMany({});
        }
        
        console.log('✅ Todas as coleções foram limpas!');

        // Recriar modelos para garantir que as coleções existam
        console.log('\n📝 Recriando estrutura das coleções...');
        getVendaModel();
        getEstoqueModel();
        getModeloModel();
        getCustoItemModel();
        console.log('✅ Estrutura recriada!');

        console.log('\n=============================================');
        console.log('✅ Banco de dados resetado com sucesso!');
        console.log('=============================================');
    } catch (err) {
        console.error('❌ Erro ao resetar banco de dados:', err);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('Conexão encerrada.');
        process.exit(0);
    }
}

resetDatabase();
