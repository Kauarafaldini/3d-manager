const { conectarBanco, inicializarDadosPadrao } = require('./db');
const mongoose = require('mongoose');

console.log('Conectando ao MongoDB Atlas...');

conectarBanco()
    .then(async () => {
        console.log('Conectado com sucesso ao MongoDB Atlas!');
        console.log('Inicializando coleções com dados iniciais (se necessário)...');
        await inicializarDadosPadrao();
        console.log('\n=============================================');
        console.log('Inicialização do banco concluída com sucesso!');
        console.log('=============================================');
    })
    .catch(err => {
        console.error('Falha na conexão com o MongoDB Atlas:', err);
        process.exit(1);
    })
    .finally(async () => {
        await mongoose.connection.close();
        console.log('Conexão encerrada.');
        process.exit(0);
    });
