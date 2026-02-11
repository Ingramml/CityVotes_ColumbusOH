# ColumbusCityVotes Configuration

**Last Updated**: 2026-02-11
**Configuration Version**: 1.0
**Project Status**: Initial Setup

---

## Project Overview
- **Name**: ColumbusCityVotes
- **Type**: [Web app / CLI tool / Library / Data project / Portfolio / Other]
- **Purpose**: [What problem does this solve? Who is it for?]
- **Target Audience**: [Who will use this?]
- **Tech Stack**: [Languages, frameworks, tools - TBD]
- **Deployment**: [Where/how will it be deployed - TBD]

## Project Goals
1. **Primary**: [Main objective]
2. **Secondary**: [Supporting objectives]
3. **Tertiary**: [Nice-to-have goals]

## Technical Requirements

### Performance
- [Load time, response time, etc.]

### Scalability
- [Expected usage, growth considerations]

### Security
- [Authentication, data protection, compliance]

### Accessibility
- [Standards to meet, e.g., WCAG 2.1 AA]

## Available Sub-Agents

Based on `.claude/master-files/agents/`, relevant agents for this project:

### Web Development
- `react-specialist`: React optimization and components
- `frontend-optimizer`: Performance optimization
- `css-styling`: Tailwind CSS and responsive design

### Backend & APIs
- `api-development`: RESTful API design
- `database-integration`: Database schema and queries
- `nodejs-backend`: Node.js/Express development

### DevOps & Deployment
- `vercel-deployment`: Vercel optimization
- `build-optimization`: Build process improvement
- `security-auditor`: Security analysis

### Project Management
- `documentation-specialist`: Technical documentation
- `project-setup`: Project structure optimization

[Add or remove agents based on project type]

## Project Structure
```
ColumbusCityVotes/
├── Session_Archives/     # Session history
├── Documents/            # Project documentation
│   ├── project-config.md # This file
│   └── context.md        # Current session context
├── logs/                 # Application logs
├── .claude/
│   └── master-files/     # Symlink to toolkit
└── [project files]
```

## Development Phases

### Phase 1: Setup
- [ ] Define project scope and requirements
- [ ] Choose tech stack
- [ ] Set up development environment
- [ ] Create initial project structure

### Phase 2: Development
- [ ] Implement core features
- [ ] Add tests
- [ ] Optimize performance

### Phase 3: Deployment
- [ ] Configure deployment
- [ ] Set up monitoring
- [ ] Deploy to production

## Success Metrics
- [How will you measure success?]
- [What defines "done"?]

## Workflow Integration
- **Opening Workflow**: Set up master-files + run project setup script
- **Development Workflow**: Use specialized agents for specific tasks
- **Closing Workflow**: Update context.md with session progress

## Usage Notes

### How to Use This Configuration
This file defines the static parameters of your project. Reference it when:
- Making architectural decisions
- Choosing technologies
- Invoking specialized agents

### Agent Usage Examples
```
"Based on project-config.md, help me decide on the best approach for [technical decision]"

"Act as the [Agent Name] from master-files. Using the requirements in Documents/project-config.md, help me [specific task]"
```

---

**Instructions**:
1. Fill in the sections above with your project details
2. Remove placeholder text and examples
3. Update this file when scope or tech stack changes
4. Keep this file in sync with actual project state

**Need Help Getting Started?**
See `~/.claude/master-files/templates/project-initialization-questions.md` for 22 questions to help define your project. Claude can ask these interactively or you can answer them by editing this file.

**Quick Start Options:**
- **Interactive**: "Claude, help me configure this project using the initialization questions"
- **Self-Guided**: Review the questions template and update this file with your answers
