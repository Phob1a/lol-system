npm install
createdb lol_system
cp .env.example .env
npm run db:migrate
npm run db:seed
npm run dev