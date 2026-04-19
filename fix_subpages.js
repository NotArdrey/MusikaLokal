const fs = require('fs');

const files = [
  'mobile/app/shop.tsx',
  'mobile/app/orders.tsx',
  'mobile/app/seller_hub.tsx',
  'mobile/app/create_playlist.tsx',
  'mobile/app/producer_projects.tsx',
  'web/app/shop.tsx',
  'web/app/orders.tsx',
  'web/app/seller_hub.tsx',
  'web/app/create_playlist.tsx',
  'web/app/producer_projects.tsx'
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;
  let content = fs.readFileSync(file, 'utf8');

  // Add onBackPress to Header where missing
  content = content.replace(/<Header title="Shop" \/>/g, '<Header title="Shop" onBackPress={() => router.back()} />');
  content = content.replace(/<Header title="Producer Projects" \/>/g, '<Header title="Producer Projects" onBackPress={() => router.back()} />');
  // Just in case we missed any other exact ones
  content = content.replace(/<Header title="Shop" \/>/g, '<Header title="Shop" onBackPress={() => router.back()} />');
  content = content.replace(/<Header title="Orders" \/>/g, '<Header title="Orders" onBackPress={() => router.back()} />');
  content = content.replace(/<Header title="Seller Hub" \/>/g, '<Header title="Seller Hub" onBackPress={() => router.back()} />');

  // Remove Navbar usage completely
  content = content.replace(/import Navbar from ["']\.\.\/src\/components\/navbar["'];?\n/g, '');
  content = content.replace(/<Navbar \/>/g, '');

  fs.writeFileSync(file, content, 'utf8');
  console.log('Fixed', file);
}
