// Block type to color mapping for top-down visualization
export const blockColors: { [key: string]: string } = {
  // Air
  'minecraft:air': '#000000',
  'minecraft:cave_air': '#000000',
  'minecraft:void_air': '#000000',

  // Stone variants
  'minecraft:stone': '#7F7F7F',
  'minecraft:granite': '#9F6F4F',
  'minecraft:diorite': '#FFFFFF',
  'minecraft:andesite': '#8C8C8C',
  'minecraft:deepslate': '#494949',
  'minecraft:tuff': '#4D5D53',
  'minecraft:cobblestone': '#7F7F7F',
  'minecraft:mossy_cobblestone': '#627F62',

  // Dirt and grass
  'minecraft:dirt': '#8B5A3C',
  'minecraft:grass_block': '#7CBD6B',
  'minecraft:podzol': '#593D2B',
  'minecraft:mycelium': '#6F5D7C',
  'minecraft:coarse_dirt': '#72462B',

  // Sand
  'minecraft:sand': '#E0D8A8',
  'minecraft:red_sand': '#BD6732',
  'minecraft:sandstone': '#DDD399',
  'minecraft:red_sandstone': '#BD6732',

  // Gravel
  'minecraft:gravel': '#837E7E',

  // Ores
  'minecraft:coal_ore': '#434343',
  'minecraft:iron_ore': '#A67C66',
  'minecraft:gold_ore': '#FCEE4B',
  'minecraft:diamond_ore': '#5DECF5',
  'minecraft:emerald_ore': '#17DD62',
  'minecraft:lapis_ore': '#1C4A9E',
  'minecraft:redstone_ore': '#E61E1E',
  'minecraft:copper_ore': '#B4684D',

  // Wood
  'minecraft:oak_log': '#9C7F4F',
  'minecraft:spruce_log': '#4D3A1A',
  'minecraft:birch_log': '#D7D7D7',
  'minecraft:jungle_log': '#644D32',
  'minecraft:acacia_log': '#BA6337',
  'minecraft:dark_oak_log': '#3E2912',
  'minecraft:oak_planks': '#9C7F4F',

  // Leaves
  'minecraft:oak_leaves': '#2C7C1E',
  'minecraft:spruce_leaves': '#2D5A26',
  'minecraft:birch_leaves': '#5A8E3A',
  'minecraft:jungle_leaves': '#2C7C1E',
  'minecraft:acacia_leaves': '#2C7C1E',
  'minecraft:dark_oak_leaves': '#2C5A1E',

  // Water and ice
  'minecraft:water': '#3F76E4',
  'minecraft:ice': '#9CF2FF',
  'minecraft:packed_ice': '#7FB5FF',
  'minecraft:blue_ice': '#74B0FF',

  // Snow
  'minecraft:snow': '#F7FEFF',
  'minecraft:snow_block': '#F7FEFF',
  'minecraft:powder_snow': '#F7FEFF',

  // Nether
  'minecraft:netherrack': '#BD3031',
  'minecraft:soul_sand': '#543C2F',
  'minecraft:soul_soil': '#4D3828',
  'minecraft:basalt': '#4C4C56',
  'minecraft:blackstone': '#2A2330',
  'minecraft:nether_bricks': '#2C161C',

  // End
  'minecraft:end_stone': '#DDEACF',
  'minecraft:obsidian': '#0F0C1A',
  'minecraft:bedrock': '#2C2C2C',

  // Default fallback
  'default': '#000000',
}

export function getBlockColor(blockName: string): string {
  // Remove minecraft: prefix if present
  const cleanName = blockName.toLowerCase().replace(/^minecraft:/, '')
  const fullName = `minecraft:${cleanName}`
  
  return blockColors[fullName] || blockColors['default']
}
