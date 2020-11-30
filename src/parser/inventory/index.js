import DICTIONARY from "../../dictionary.js";
// type: weapon
import parseWeapon from "./weapon.js";
import parseAmmunition from "./ammunition.js";
import parseStaff from "./staves.js";

// type: armor
import parseArmor from "./armor.js";

// tyoe: wonderous item
import parseWonderous from "./wonderous.js";

// type: consumables
import parsePotion from "./potion.js";
import parseScroll from "./scroll.js";

// type: tool
import parseTool from "./tool.js";

// other loot
import parseLoot from "./loot.js";
import parseCustomItem from "./custom.js";
import utils from "../../utils.js";

// magicitems support
import parseMagicItem from "./magicify.js";
import logger from "../../logger.js";

/**
 * We get extra damage to a weapon attack here, for example Improved
 * Divine Smite
 * @param {*} data
 * @param {*} restrictions (array)
 */
function getExtraDamage(ddb, restrictions) {
  return utils.filterBaseModifiers(ddb, "damage", null, restrictions).map((mod) => {
    if (mod.dice) {
      return [mod.dice.diceString, mod.subType];
    } else if (mod.value) {
      return [mod.value, mod.subType];
    } else {
      return [null, null];
    }
  });
}

function getWarlockFeatures(ddb, weapon) {
  // Some features, notably hexblade abilities we scrape out here
  const warlockFeatures = ddb.character.characterValues
    .filter(
      (characterValue) =>
        characterValue.value &&
        characterValue.valueId == weapon.id &&
        DICTIONARY.character.characterValuesLookup.some(
          (entry) => entry.typeId == characterValue.typeId
        )
    )
    .map(
      (characterValue) =>
        DICTIONARY.character.characterValuesLookup.find(
          (entry) => entry.typeId == characterValue.typeId
        ).name
    );

  // Any Pact Weapon Features
  const pactFeatures = ddb.character.options.class
    .filter(
      (option) =>
        warlockFeatures.includes("pactWeapon") &&
        option.definition.name &&
        DICTIONARY.character.pactFeatures.includes(option.definition.name)
    )
    .map((option) => option.definition.name);

  const features = warlockFeatures.concat(pactFeatures);
  return features;
}

function getMonkFeatures(ddb, weapon) {
  const kenseiWeapon = ddb.character.modifiers.class.some((mod) =>
    mod.friendlySubtypeName === weapon.definition.type &&
    mod.type === "kensei"
  );

  const monkWeapon = ddb.character.modifiers.class.some((mod) =>
    mod.friendlySubtypeName === weapon.definition.type &&
    mod.type == "monk-weapon"
  ) || weapon.definition.isMonkWeapon;

  let features = [];

  if (kenseiWeapon) features.push("kenseiWeapon");
  if (monkWeapon) features.push("monkWeapon");

  return features;
}


function getMartialArtsDie(ddb) {
  let result = {
    diceCount: null,
    diceMultiplier: null,
    diceString: null,
    diceValue: null,
    fixedValue: null,
  };

  const die = ddb.character.classes
    // is a martial artist
    .filter((cls) => cls.classFeatures.some((feature) => feature.definition.name === "Martial Arts"))
    // get class features
    .map((cls) => cls.classFeatures)
    .flat()
    // filter relevant features, those that are martial arts and have a levelscaling hd
    .filter((feature) => feature.definition.name === "Martial Arts" && feature.levelScale && feature.levelScale.dice)
    // get this dice object
    .map((feature) => feature.levelScale.dice);

  if (die && die.length > 0) {
    result = die[0];
  }

  return result;

}

function getClassFeatures(ddb, weapon) {
  const warlockFeatures = getWarlockFeatures(ddb, weapon);
  const monkFeatures = getMonkFeatures(ddb, weapon);
  return warlockFeatures.concat(monkFeatures);
}

function getWeaponFlags(ddb, data) {
  let flags = {
    damage: {
      parts: [],
    },
      // Some features, notably hexblade abilities we scrape out here
    classFeatures: getClassFeatures(ddb, data),
    martialArtsDie: getMartialArtsDie(ddb),
  };

  if (flags.classFeatures.includes("Lifedrinker")) {
    flags.damage.parts.push(["@mod", "necrotic"]);
  }

  // for melee attacks get extras
  if (data.definition.attackType === 1) {
    // get improved divine smite etc for melee attacks
    const extraDamage = getExtraDamage(ddb, ["Melee Weapon Attacks"]);

    if (!!extraDamage.length > 0) {
      flags.damage.parts = flags.damage.parts.concat(extraDamage);
    }
    // do we have great weapon fighting?
    if (utils.hasChosenCharacterOption(ddb, "Great Weapon Fighting")) {
      flags.classFeatures.push("greatWeaponFighting");
    }
    // do we have dueling fighting style?
    if (utils.hasChosenCharacterOption(ddb, "Dueling")) {
      flags.classFeatures.push("Dueling");
    }
  }
  // ranged fighting style is added as a global modifier elsewhere
  // as is defensive style

  return flags;
}

function otherGear (ddb, data, character) {
  let item = {};
  switch (data.definition.subType) {
    case "Potion":
      item = parsePotion(data);
      break;
    case "Tool":
      item = parseTool(ddb, data);
      break;
    case "Ammunition":
      item = parseAmmunition(data);
      break;
    default:
      // Final exceptions
      switch (data.definition.name) {
        case "Thieves' Tools":
          item = parseTool(ddb, data, character);
          break;
        default:
          item = parseLoot(data);
      }
  }
  return item;
}

function getCustomValue(data, character, type) {
  if (!character) return null;
  const characterValues = character.flags.ddbimporter.dndbeyond.characterValues;
  const customValue = characterValues.filter((value) => value.valueId == data.id && value.valueTypeId == data.entityTypeId);

  if (customValue) {
    const value = customValue.find((value) => value.typeId == type);
    if (value) return value.value;
  }
  return null;
}

function addCustomValues(ddbItem, foundryItem, character) {
  // to hit override requires a lot of crunching
  // const toHitOverride = getCustomValue(item, character, 13);
  const toHitBonus = getCustomValue(ddbItem, character, 12);
  const damageBonus = getCustomValue(ddbItem, character, 10);
  // const displayAsAttack = getCustomValue(item, character, 16);
  const costOverride = getCustomValue(ddbItem, character, 19);
  const weightOverride = getCustomValue(ddbItem, character, 22);
  // dual wield 18
  // silvered
  // adamantine

  if (toHitBonus) foundryItem.data.attackBonus += toHitBonus;
  if (damageBonus) foundryItem.data.damage.parts[0][0] = foundryItem.data.damage.parts[0][0].concat(` +${damageBonus}`);
  if (costOverride) foundryItem.data.cost = costOverride;
  if (weightOverride) foundryItem.data.weight = weightOverride;
}

function parseItem(ddb, data, character) {
  try {
    // is it a weapon?
    let item = {};
    if (data.definition.filterType) {
      switch (data.definition.filterType) {
        case "Weapon": {
          if (data.definition.type === "Ammunition" || data.definition.subType === "Ammunition") {
            item = parseAmmunition(data);
          } else {
            const flags = getWeaponFlags(ddb, data);
            item = parseWeapon(data, character, flags);
          }
          break;
        }
        case "Armor":
          item = parseArmor(data, character);
          break;
        case "Wondrous item":
        case "Ring":
        case "Wand":
        case "Rod":
          item = parseWonderous(data);
          break;
        case "Staff":
          item = parseStaff(data, character);
          break;
        case "Potion":
          item = parsePotion(data);
          break;
        case "Scroll":
          item = parseScroll(data);
          break;
        case "Other Gear": {
          item = otherGear(ddb, data, character);
          break;
        }
        default:
          item = parseLoot(data, character);
          break;
      }
    } else {
      // try parsing it as a custom item
      item = parseCustomItem(data);
    }
    if (data.definition.avatarUrl) item.flags.ddbimporter.dndbeyond['avatarUrl'] = data.definition.avatarUrl.split('?')[0];
    if (data.definition.largeAvatarUrl) item.flags.ddbimporter.dndbeyond['largeAvatarUrl'] = data.definition.largeAvatarUrl.split('?')[0];
    return item;
  } catch (err) {
    logger.warn(
      `Unable to parse item: ${data.definition.name}, ${data.definition.type}/${data.definition.filterType}. ${err.message}`,
      "character"
    );
    logger.error(err.stack);
    return { // return empty strut
      name: data.definition.name,
      flags: {
        ddbimporter: {
          dndbeyond: {
          },
        },
      },
    };
  }
}

function getName(data, character) {
  // spell name
  const customName = getCustomValue(data, character, 8);
  if (customName) {
    return customName;
  } else {
    return data.definition.name;
  }
}


export default function getInventory(ddb, character, itemSpells) {
  let items = [];
  // first, check custom name, price or weight
  ddb.character.characterValues.forEach((cv) => {
    // try to find a matching item based on the characterValues (an array of custom adjustements to different parts of the character)
    let item = ddb.character.inventory.find((item) => item.id === cv.valueId);
    if (item) {
      // check if this property is in the list of supported ones, based on our DICT
      let property = DICTIONARY.item.characterValues.find((entry) => entry.typeId === cv.typeId);
      // overwrite the name, weight or price with the custom value
      if (property && cv.value.length !== 0) item.definition[property.value] = cv.value;
    }
  });

  // now parse all items

  const customItems = ddb.character.customItems
    ? ddb.character.customItems.map((customItem) => ({
      definition: customItem,
    }))
    : [];

  for (let entry of ddb.character.inventory.concat(customItems)) {
    entry.definition.name = getName(entry, character);
    var item = Object.assign({}, parseItem(ddb, entry, character));
    addCustomValues(entry, item, character);
    if (item) {
      item.flags.magicitems = parseMagicItem(entry, itemSpells);
      items.push(item);
    }
  }
  return items;
}