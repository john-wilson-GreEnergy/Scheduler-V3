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
('manager_eval_tech', 'Professionalism & Field Conduct', 'The technician can be relied upon to conduct themselves appropriately in a professional setting.', 25);
