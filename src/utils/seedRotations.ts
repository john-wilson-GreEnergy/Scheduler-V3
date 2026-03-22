import { supabase } from '../lib/supabase';

const rotationData = {
  A: [
    "austin.bass@greenergyresources.com",
    "brandon.musella@greenergyresources.com",
    "cesar.uribe@greenergyresources.com",
    "jason.ashley@greenergyresources.com",
    "jeremy.kyles@greenergyresources.com",
    "john.wilson@greenergyresources.com",
    "jordan.ramirez@greenergyresources.com",
    "jose.morin@greenergyresources.com",
    "jose.vargas@greenergyresources.com",
    "lane.newman@greenergyresources.com",
    "matthew.hess@greenergyresources.com",
    "mickael.langlois@greenergyresources.com",
    "miles.hawkins@greenergyresources.com",
    "nathan.medrano@greenergyresources.com",
    "nicolas.solis@greenergyresources.com",
    "raven.bowden@greenergyresources.com"
  ],
  B: [
    "adam.fenner@greenergyresources.com",
    "aj.ashley@greenergyresources.com",
    "austin.delozier@greenergyresources.com",
    "chris.burns@greenergyresources.com",
    "christopher.rich@greenergyresources.com",
    "cj.good@greenergyresources.com",
    "isaiah.martinez@greenergyresources.com",
    "jonathan.stevenson@greenergyresources.com",
    "joshua.osseweyer@greenergyresources.com",
    "kalen.fryer@greenergyresources.com",
    "rex.davis@greenergyresources.com",
    "ricardo.corpus@greenergyresources.com",
    "robert.beesler@greenergyresources.com",
    "ryan.pryor@greenergyresources.com",
    "trent.war@greenergyresources.com",
    "tristen.cantin@greenergyresources.com"
  ],
  C: [
    "brett.wanamaker@greenergyresources.com",
    "cesar.delgado@greenergyresources.com",
    "cesar.marin@greenergyresources.com",
    "codey.hill@greenergyresources.com",
    "edgar.anguiano@greenergyresources.com",
    "eduardo.alanis@greenergyresources.com",
    "hunter.anglin@greenergyresources.com",
    "katie.nessmith@greenergyresources.com",
    "mario.hernandez@greenergyresources.com",
    "nicholas.west@greenergyresources.com",
    "ramiro.capetillo@greenergyresources.com"
  ],
  D: [
    "alex.herring@greenergyresources.com",
    "david.kroeker@greenergyresources.com",
    "david.dibbern@greenergyresources.com",
    "eduardo.mendoza@greenergyresources.com",
    "hunter.launer@greenergyresources.com",
    "junior.guerrero@greenergyresources.com",
    "leonel.martinez@greenergyresources.com",
    "luis.huerta@greenergyresources.com",
    "michael.good@greenergyresources.com",
    "taylor.denton@greenergyresources.com",
    "theo.adelman@greenergyresources.com",
    "tommy.mcgrath@greenergyresources.com",
    "tyler.marshall@greenergyresources.com"
  ]
};

export async function seedRotationGroups() {
  console.log('Starting rotation group seeding...');
  
  // 1. Fetch all employees
  const { data: employees, error: fetchError } = await supabase
    .from('employees')
    .select('id, email, rotation_group');

  if (fetchError) {
    console.error('Error fetching employees for seeding:', fetchError);
    return;
  }

  console.log(`Found ${employees?.length} employees to process.`);

  const updates = [];
  
  // Map of email to target group
  const emailToGroup: Record<string, string | null> = {};
  for (const [group, emails] of Object.entries(rotationData)) {
    emails.forEach(email => {
      emailToGroup[email.toLowerCase()] = group;
    });
  }

  // Identify updates needed
  for (const emp of employees || []) {
    const targetGroup = emp.email ? emailToGroup[emp.email.trim().toLowerCase()] || null : null;
    if (emp.rotation_group !== targetGroup) {
      updates.push(
        supabase
          .from('employees')
          .update({ rotation_group: targetGroup })
          .eq('id', emp.id)
      );
    }
  }

  if (updates.length > 0) {
    console.log(`Executing ${updates.length} updates...`);
    const results = await Promise.all(updates);
    const errors = results.filter(r => r.error);
    
    if (errors.length > 0) {
      console.error(`${errors.length} updates failed:`, errors);
      const firstError = errors[0].error;
      throw new Error(`Permission denied or database error: ${firstError?.message || 'Unknown error'}`);
    } else {
      console.log('All updates completed successfully.');
    }
  } else {
    console.log('No updates needed. All employees already in correct groups.');
  }
  
  console.log('Rotation group seeding complete.');
}
