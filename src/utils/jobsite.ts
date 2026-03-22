import { JobsiteGroup } from '../types';

export const getGroupName = (groupId: string | undefined, jobsiteGroups: JobsiteGroup[]) => {
  return jobsiteGroups.find(g => g.id === groupId)?.name;
};
