// Plant sectors used across all sources, and the GLOBE material types each supplies.
export const SECTORS = {
  cement: { name: 'Cement', materials: ['concrete', 'precast', 'cmu', 'mortar', 'fibrecement'] },
  lime: { name: 'Lime', materials: ['mortar', 'plaster'] },
  gypsum: { name: 'Gypsum and plaster', materials: ['gypsum', 'plaster'] },
  concrete: { name: 'Concrete and concrete products', materials: ['concrete', 'precast', 'cmu'] },
  steel: { name: 'Iron and steel', materials: ['steel', 'rebar', 'coldformed', 'metalroof'] },
  aluminium: { name: 'Aluminium', materials: ['aluminium', 'metalroof'] },
  glass: { name: 'Glass', materials: ['glass'] },
  insulation: { name: 'Insulation', materials: ['mineralwool', 'foam', 'cellulose'] },
  brick: { name: 'Brick, clay and ceramics', materials: ['brick', 'rooftile'] },
  timber: { name: 'Sawmills and wood products', materials: ['timber', 'masstimber', 'woodpanel'] },
  quarry: { name: 'Quarries and aggregates', materials: ['stone', 'concrete'] },
};

// US NAICS (2022) codes selected from EPA facility data. Sector per code.
export const NAICS = {
  327310: 'cement', 327410: 'lime', 327420: 'gypsum',
  327320: 'concrete', 327331: 'concrete', 327332: 'concrete', 327390: 'concrete',
  331110: 'steel', 331221: 'steel', 331222: 'steel',
  331313: 'aluminium', 331315: 'aluminium', 331318: 'aluminium',
  327211: 'glass', 327212: 'glass', 327215: 'glass', 327993: 'insulation',
  327120: 'brick', 327110: 'brick',
  321113: 'timber', 321211: 'timber', 321212: 'timber', 321213: 'timber', 321215: 'timber', 321219: 'timber',
  212311: 'quarry', 212312: 'quarry', 212313: 'quarry', 212319: 'quarry', 212321: 'quarry', 212322: 'quarry',
};

// EU NACE Rev. 2 classes (UK PRTR main economic activity).
export const NACE = {
  '23.51': 'cement', '23.52': 'lime', '23.62': 'gypsum', '23.61': 'concrete', '23.63': 'concrete', '23.64': 'concrete', '23.69': 'concrete',
  '24.10': 'steel', '24.42': 'aluminium', '23.11': 'glass', '23.12': 'glass', '23.14': 'insulation', '23.99': 'insulation',
  '23.31': 'brick', '23.32': 'brick', '16.10': 'timber', '16.21': 'timber', '16.23': 'timber', '08.11': 'quarry', '08.12': 'quarry',
};
