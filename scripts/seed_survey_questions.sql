-- Populate survey_questions table
INSERT INTO survey_questions (survey_type, category, question_text, display_order) VALUES
-- Survey 1: Technician Evaluation of Site Manager
('tech_eval_manager', 'Leadership & Communication', 'The Site Manager clearly communicates daily goals and expectations.', 1),
('tech_eval_manager', 'Leadership & Communication', 'The Site Manager provides clear direction before work begins.', 2),
('tech_eval_manager', 'Leadership & Communication', 'The Site Manager communicates changes in priorities effectively.', 3),
('tech_eval_manager', 'Leadership & Communication', 'The Site Manager listens to questions or concerns from technicians.', 4),
('tech_eval_manager', 'Leadership & Communication', 'The Site Manager provides helpful feedback and guidance during the workday.', 5),

('tech_eval_manager', 'Jobsite Management & Organization', 'The Site Manager keeps the jobsite organized and structured.', 6),
('tech_eval_manager', 'Jobsite Management & Organization', 'The Site Manager manages labor and task assignments effectively.', 7),
('tech_eval_manager', 'Jobsite Management & Organization', 'The Site Manager keeps work progressing efficiently throughout the day.', 8),
('tech_eval_manager', 'Jobsite Management & Organization', 'The Site Manager plans work in a way that reduces downtime and confusion.', 9),
('tech_eval_manager', 'Jobsite Management & Organization', 'The Site Manager demonstrates good control of the overall jobsite operation.', 10),

('tech_eval_manager', 'Technical Knowledge & Support', 'The Site Manager demonstrates strong knowledge of the commissioning work being performed.', 11),
('tech_eval_manager', 'Technical Knowledge & Support', 'The Site Manager understands the systems, equipment, and procedures involved in the work.', 12),
('tech_eval_manager', 'Technical Knowledge & Support', 'The Site Manager can troubleshoot issues effectively when they arise.', 13),
('tech_eval_manager', 'Technical Knowledge & Support', 'The Site Manager provides accurate technical guidance when technicians need support.', 14),
('tech_eval_manager', 'Technical Knowledge & Support', 'The Site Manager demonstrates confidence and competence in the technical aspects of the project.', 15),

('tech_eval_manager', 'Safety Leadership & Enforcement', 'The Site Manager consistently promotes safe work practices.', 16),
('tech_eval_manager', 'Safety Leadership & Enforcement', 'The Site Manager enforces safety rules and procedures fairly and consistently.', 17),
('tech_eval_manager', 'Safety Leadership & Enforcement', 'The Site Manager addresses unsafe conditions or behaviors promptly.', 18),
('tech_eval_manager', 'Safety Leadership & Enforcement', 'The Site Manager sets a strong example through their own safe work behavior.', 19),
('tech_eval_manager', 'Safety Leadership & Enforcement', 'The Site Manager maintains strong awareness of safety risks on the jobsite.', 20),

('tech_eval_manager', 'Professionalism & Customer Presence', 'The Site Manager maintains a professional attitude on the jobsite.', 21),
('tech_eval_manager', 'Professionalism & Customer Presence', 'The Site Manager demonstrates appropriate dress, cleanliness, and conduct.', 22),
('tech_eval_manager', 'Professionalism & Customer Presence', 'The Site Manager communicates professionally with technicians and other personnel.', 23),
('tech_eval_manager', 'Professionalism & Customer Presence', 'The Site Manager represents the company well when interacting with customers or contractors.', 24),
('tech_eval_manager', 'Professionalism & Customer Presence', 'The Site Manager demonstrates attention to detail in both communication and jobsite conduct.', 25),

-- Survey 2: Site Manager Evaluation of Technician
('manager_eval_tech', 'Time Management & Work Ethic', 'The technician manages time effectively during daily work activities.', 1),
('manager_eval_tech', 'Time Management & Work Ethic', 'The technician remains productive throughout the workday.', 2),
('manager_eval_tech', 'Time Management & Work Ethic', 'The technician completes assigned work in a timely manner.', 3),
('manager_eval_tech', 'Time Management & Work Ethic', 'The technician shows initiative in staying engaged with the work.', 4),
('manager_eval_tech', 'Time Management & Work Ethic', 'The technician demonstrates a strong work ethic on the jobsite.', 5),

('manager_eval_tech', 'Technical Knowledge & Tool Use', 'The technician demonstrates a good understanding of the work being performed.', 6),
('manager_eval_tech', 'Technical Knowledge & Tool Use', 'The technician uses tools and equipment properly and safely.', 7),
('manager_eval_tech', 'Technical Knowledge & Tool Use', 'The technician follows technical procedures correctly.', 8),
('manager_eval_tech', 'Technical Knowledge & Tool Use', 'The technician demonstrates the ability to learn and apply technical instructions.', 9),
('manager_eval_tech', 'Technical Knowledge & Tool Use', 'The technician can assist in identifying or troubleshooting issues when they arise.', 10),

('manager_eval_tech', 'Quality & Attention to Detail', 'The technician performs work carefully and accurately.', 11),
('manager_eval_tech', 'Quality & Attention to Detail', 'The technician pays attention to details that affect quality and task completion.', 12),
('manager_eval_tech', 'Quality & Attention to Detail', 'The technician follows instructions without skipping important steps.', 13),
('manager_eval_tech', 'Quality & Attention to Detail', 'The technician demonstrates pride in the quality of their work.', 14),
('manager_eval_tech', 'Quality & Attention to Detail', 'The technician helps ensure work is completed to expected standards.', 15),

('manager_eval_tech', 'Safety & Teamwork', 'The technician consistently follows safety procedures and expectations.', 16),
('manager_eval_tech', 'Safety & Teamwork', 'The technician demonstrates strong safety awareness during work activities.', 17),
('manager_eval_tech', 'Safety & Teamwork', 'The technician works well with others as part of a team.', 18),
('manager_eval_tech', 'Safety & Teamwork', 'The technician communicates effectively with coworkers and leadership.', 19),
('manager_eval_tech', 'Safety & Teamwork', 'The technician contributes positively to the overall work environment.', 20),

('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician maintains appropriate dress, cleanliness, and conduct for the work environment.', 21),
('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician demonstrates a professional attitude on the jobsite.', 22),
('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician treats coworkers, leadership, and customers respectfully.', 23),
('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician represents the company professionally in the field.', 24),
('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician can be relied upon to conduct themselves appropriately in a professional setting.', 25),

-- Survey 3: Technician Evaluation of Site Lead
('tech_eval_lead', 'Field Leadership & Support', 'The Site Lead provides clear direction during daily work activities.', 1),
('tech_eval_lead', 'Field Leadership & Support', 'The Site Lead is approachable and willing to assist technicians when needed.', 2),
('tech_eval_lead', 'Field Leadership & Support', 'The Site Lead helps keep the team aligned and working toward common goals.', 3),
('tech_eval_lead', 'Field Leadership & Support', 'The Site Lead provides guidance without creating confusion or conflict.', 4),
('tech_eval_lead', 'Field Leadership & Support', 'Overall, the Site Lead demonstrates effective field-level leadership.', 5),

('tech_eval_lead', 'Technical Knowledge & Execution', 'The Site Lead demonstrates strong knowledge of the work being performed.', 6),
('tech_eval_lead', 'Technical Knowledge & Execution', 'The Site Lead can effectively perform the same technical tasks as the team.', 7),
('tech_eval_lead', 'Technical Knowledge & Execution', 'The Site Lead provides accurate technical guidance when questions arise.', 8),
('tech_eval_lead', 'Technical Knowledge & Execution', 'The Site Lead helps troubleshoot issues efficiently in the field.', 9),
('tech_eval_lead', 'Technical Knowledge & Execution', 'Overall, the Site Lead demonstrates strong technical competence.', 10),

('tech_eval_lead', 'Productivity & Work Ethic', 'The Site Lead maintains a strong work pace throughout the day.', 11),
('tech_eval_lead', 'Productivity & Work Ethic', 'The Site Lead contributes actively to completing work alongside the team.', 12),
('tech_eval_lead', 'Productivity & Work Ethic', 'The Site Lead helps keep work moving forward without unnecessary delays.', 13),
('tech_eval_lead', 'Productivity & Work Ethic', 'The Site Lead demonstrates a strong work ethic in the field.', 14),
('tech_eval_lead', 'Productivity & Work Ethic', 'Overall, the Site Lead positively contributes to team productivity.', 15),

('tech_eval_lead', 'Safety & Accountability', 'The Site Lead consistently follows and promotes safe work practices.', 16),
('tech_eval_lead', 'Safety & Accountability', 'The Site Lead corrects unsafe behavior when it is observed.', 17),
('tech_eval_lead', 'Safety & Accountability', 'The Site Lead maintains awareness of safety risks in the work environment.', 18),
('tech_eval_lead', 'Safety & Accountability', 'The Site Lead leads by example when it comes to safety.', 19),
('tech_eval_lead', 'Safety & Accountability', 'Overall, the Site Lead demonstrates strong safety accountability.', 20),

('tech_eval_lead', 'Teamwork & Professionalism', 'The Site Lead works well with the team and maintains a positive environment.', 21),
('tech_eval_lead', 'Teamwork & Professionalism', 'The Site Lead communicates clearly and respectfully with team members.', 22),
('tech_eval_lead', 'Teamwork & Professionalism', 'The Site Lead maintains professional conduct on the jobsite.', 23),
('tech_eval_lead', 'Teamwork & Professionalism', 'The Site Lead treats all team members fairly and professionally.', 24),
('tech_eval_lead', 'Teamwork & Professionalism', 'Overall, the Site Lead demonstrates strong teamwork and professionalism.', 25),

-- Survey 4: Site Lead Evaluation of BESS Technician
('lead_eval_tech', 'Work Ethic & Reliability', 'The technician shows up prepared and ready to work.', 1),
('lead_eval_tech', 'Work Ethic & Reliability', 'The technician maintains a consistent and reliable work pace.', 2),
('lead_eval_tech', 'Work Ethic & Reliability', 'The technician can be trusted to complete assigned tasks without constant oversight.', 3),
('lead_eval_tech', 'Work Ethic & Reliability', 'The technician stays engaged throughout the workday.', 4),
('lead_eval_tech', 'Work Ethic & Reliability', 'Overall, the technician demonstrates strong reliability and work ethic.', 5),

('lead_eval_tech', 'Technical Skills & Execution', 'The technician demonstrates a solid understanding of the work being performed.', 6),
('lead_eval_tech', 'Technical Skills & Execution', 'The technician performs tasks correctly and efficiently.', 7),
('lead_eval_tech', 'Technical Skills & Execution', 'The technician uses tools and equipment properly.', 8),
('lead_eval_tech', 'Technical Skills & Execution', 'The technician can follow technical instructions without repeated correction.', 9),
('lead_eval_tech', 'Technical Skills & Execution', 'Overall, the technician demonstrates strong technical execution.', 10),

('lead_eval_tech', 'Learning & Adaptability', 'The technician is open to feedback and correction.', 11),
('lead_eval_tech', 'Learning & Adaptability', 'The technician learns quickly when shown new tasks or procedures.', 12),
('lead_eval_tech', 'Learning & Adaptability', 'The technician adapts well to changing work conditions or priorities.', 13),
('lead_eval_tech', 'Learning & Adaptability', 'The technician asks appropriate questions when unsure.', 14),
('lead_eval_tech', 'Learning & Adaptability', 'Overall, the technician demonstrates a strong ability to learn and adapt.', 15),

('lead_eval_tech', 'Safety & Awareness', 'The technician consistently follows safety procedures.', 16),
('lead_eval_tech', 'Safety & Awareness', 'The technician demonstrates awareness of potential hazards.', 17),
('lead_eval_tech', 'Safety & Awareness', 'The technician takes responsibility for working safely.', 18),
('lead_eval_tech', 'Safety & Awareness', 'The technician contributes to maintaining a safe work environment.', 19),
('lead_eval_tech', 'Safety & Awareness', 'Overall, the technician demonstrates strong safety awareness.', 20),

('lead_eval_tech', 'Teamwork & Communication', 'The technician works well with others as part of a team.', 21),
('lead_eval_tech', 'Teamwork & Communication', 'The technician communicates clearly with coworkers and leadership.', 22),
('lead_eval_tech', 'Teamwork & Communication', 'The technician contributes positively to the team environment.', 23),
('lead_eval_tech', 'Teamwork & Communication', 'The technician is willing to assist others when needed.', 24),
('lead_eval_tech', 'Teamwork & Communication', 'Overall, the technician demonstrates strong teamwork and communication.', 25);
