import { baseSpellEffect, generateMacroChange, generateMacroFlags, generateATLChange, spellEffectModules } from "../specialSpells.js";

export function darkvisionEffect(document) {
  let effect = baseSpellEffect(document, document.name);
  effect.changes.push({
    key: "data.attributes.senses.darkvision",
    value: "60",
    mode: CONST.ACTIVE_EFFECT_MODES.UPGRADE,
    priority: 20,
  });

  if (spellEffectModules().atlInstalled) {
    effect.changes.push(generateATLChange("ATL.dimSight", CONST.ACTIVE_EFFECT_MODES.UPGRADE, '60', 5));
  } else {
    // MACRO START
    const itemMacroText = `
if (!game.modules.get("advanced-macros")?.active) {
  ui.notifications.error("Please enable the Advanced Macros module");
  return;
}

const lastArg = args[args.length - 1];
const tokenOrActor = await fromUuid(lastArg.actorUuid);
const targetActor = tokenOrActor.actor ? tokenOrActor.actor : tokenOrActor;
const targetToken = await fromUuid(lastArg.tokenUuid);

const dimVision = targetToken.data.dimSight;
if (args[0] === "on") {
    DAE.setFlag(targetActor, 'darkvisionSpell', dimVision);
    const newSight = dimVision < 60 ? 60 : dimVision
    await targetToken.update({"dimSight" : newSight});
    await targetActor.update({"token.dimSight" : newSight})
    ChatMessage.create({content: \`\${targetToken.name}'s vision has been improved\`});
}
if(args[0] === "off") {
    const sight = DAE.getFlag(targetActor, 'darkvisionSpell');
    targetToken.update({"dimSight" : sight });
    await targetActor.update({"token.dimSight" : sight})
    DAE.unsetFlag(targetActor, 'darkvisionSpell');
    ChatMessage.create({content: \`\${targetToken.name}'s vision has been returned\`});
}
`;
    // MACRO STOP
    document.flags["itemacro"] = generateMacroFlags(document, itemMacroText);
    effect.changes.push(generateMacroChange(""));
  }

  document.effects.push(effect);

  return document;
}