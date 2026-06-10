const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

// Conexão com MongoDB
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/3d-manager';

async function migrate() {
    try {
        console.log('Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Conectado com sucesso!');

        // Nome da coleção de modelos/produtos
        const collectionName = 'modelos';

        // Verificar se a coleção existe
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionExists = collections.some(c => c.name === collectionName);

        if (!collectionExists) {
            console.log(`Coleção '${collectionName}' não encontrada. Criando...`);
            await mongoose.connection.db.createCollection(collectionName);
            console.log(`Coleção '${collectionName}' criada.`);
        }

        const collection = mongoose.connection.db.collection(collectionName);

        // Buscar todos os documentos
        const docs = await collection.find({}).toArray();
        console.log(`Encontrados ${docs.length} documentos na coleção '${collectionName}'.`);

        let updatedCount = 0;

        // Atualizar cada documento com os novos campos se não existirem
        for (const doc of docs) {
            const updates = {};
            let needsUpdate = false;

            // Adicionar campo sku se não existir
            if (!doc.hasOwnProperty('sku')) {
                updates.sku = '';
                needsUpdate = true;
            }

            // Adicionar campo venda se não existir
            if (!doc.hasOwnProperty('venda')) {
                updates.venda = 0;
                needsUpdate = true;
            }

            // Adicionar campo estoque se não existir
            if (!doc.hasOwnProperty('estoque')) {
                updates.estoque = 0;
                needsUpdate = true;
            }

            // Adicionar campo custoProducao se não existir
            if (!doc.hasOwnProperty('custoProducao')) {
                updates.custoProducao = 0;
                needsUpdate = true;
            }

            // Adicionar campo custoProducaoTotal se não existir
            if (!doc.hasOwnProperty('custoProducaoTotal')) {
                updates.custoProducaoTotal = 0;
                needsUpdate = true;
            }

            // Adicionar campo quantidadeChapa se não existir
            if (!doc.hasOwnProperty('quantidadeChapa')) {
                updates.quantidadeChapa = 1;
                needsUpdate = true;
            }

            // Se houver atualizações necessárias, aplicar
            if (needsUpdate) {
                await collection.updateOne(
                    { _id: doc._id },
                    { $set: updates }
                );
                updatedCount++;
                console.log(`Atualizado documento: ${doc.nome || doc._id}`);
            }
        }

        console.log(`\nMigração concluída!`);
        console.log(`Total de documentos atualizados: ${updatedCount} de ${docs.length}`);

        await mongoose.disconnect();
        console.log('Desconectado do MongoDB.');
        process.exit(0);
    } catch (error) {
        console.error('Erro durante migração:', error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

migrate();
