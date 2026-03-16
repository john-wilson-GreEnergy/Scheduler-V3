export const parseAssignmentNames = (assignmentName: string | null | undefined): string[] => {
  if (!assignmentName) return [];
  return assignmentName.split('/').map(name => name.trim()).filter(name => name.length > 0);
};
