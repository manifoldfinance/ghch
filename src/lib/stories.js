const chalk   = require('chalk');
const client  = require('./client.js');
const log     = console.log;
var wfs       = [];
var projects  = [];
var members   = [];
var wf        = { states: [] };

const listStories = async (program) => {
    [ wfs, members, projects ] = await Promise.all([
        client.listWorkflows(),
        client.listMembers(),
        client.listProjects()
    ]);
    wf = wfs[0];    // TODO: this is always getting the default workflow
    let regexProject = new RegExp(program.project, 'i');
    const filteredProjects = projects
        .filter(p => {
            return !!(p.id + p.name).match(regexProject);
        });
    var stories = await Promise.all(filteredProjects.map(fetchStories));
    return stories.map(filterStories(program, filteredProjects))
        .reduce((a, b) => {
            return a.concat(b);
        }, []);
};
const fetchStories = async (project) => {
    return client.listStories(project.id);
};
const filterStories = (program, projects) => { return (stories, index) => {
    const project = projects[index];
    let created_at = false;
    if (program.created)
        created_at = parseDateComparator(program.created);
    let updated_at = false;
    if (program.updated)
        updated_at = parseDateComparator(program.updated);
    let regexLabel = new RegExp(program.label, 'i');
    let regexState = new RegExp(program.state, 'i');
    let regexOwner = new RegExp(program.owner, 'i');
    let regexText = new RegExp(program.text, 'i');
    let regexType = new RegExp(program.type, 'i');
    const filtered = stories.map(story => {
        story.project = project;
        story.state = wf.states
            .filter(s => s.id === story.workflow_state_id)[0];
        story.owners = members.filter(m => {
            return story.owner_ids.indexOf(m.id) > -1;
        });
        return story;
    }).filter(s => {
        if (!program.archived && s.archived) {
            return false;
        }
        if (!(s.labels
            .map(l => `${l.id},${l.name}`).join(',') + '')
            .match(regexLabel)) {
            return false;
        }
        if (!(s.workflow_state_id + ' ' + (s.state || {}).name)
            .match(regexState)) {
            return false;
        }
        if (program.owner) {
            const owned = s.owners.filter(o => {
                return !!`${o.profile.name} ${o.profile.mention_name}`
                    .match(regexOwner);
            }).length > 0;
            if (!owned) return false;
        }
        if (!s.name.match(regexText)) {
            return false;
        }
        if (!s.story_type.match(regexType)) {
            return false;
        }
        if (created_at && !created_at(s.created_at)) {
            return false;
        }
        if (updated_at && !updated_at(s.updated_at)) {
            return false;
        }
        return true;
    });
    return filtered;
};};

const printStory = (program) => { return (story) => {
    const defaultFormat = `#%i %t
    \tType:   \t%y/%e
    \tLabels: \t%l
    \tProject:\t%p
    \tOwners: \t%o
    \tState:  \t%s
    \tURL:    \t%u
    \tCreated:\t%c\tUpdated: %u
    \tArchived:\t%a
    `;
    const format = program.format || defaultFormat;
    const labels = story.labels.map(l => {
        return chalk.bold(`#${l.id}`) + ` ${l.name}`;
    });
    const owners = story.owners.map(o => {
        return `${o.profile.name} (` + chalk.bold(`${o.profile.mention_name}` + ')');
    });
    log(format
        .replace(/%i/, chalk.blue.bold(`${story.id}`))
        .replace(/%t/, chalk.blue(`${story.name}`))
        .replace(/%d/, story.description || '')
        .replace(/%y/, story.story_type)
        .replace(/%e/, story.estimate || '_')
        .replace(/%l/, labels.join(', ') || '_')
        .replace(/%p/, chalk.bold(`#${story.project.id}`) + ` ${story.project.name}`)
        .replace(/%o/, owners.join(', ') || '_')
        .replace(/%s/, chalk.bold(`#${story.workflow_state_id} `) + story.state.name)
        .replace(/%u/, `https://app.clubhouse.io/story/${story.id}`)
        .replace(/%c/, story.created_at)
        .replace(/%u/, story.updated_at != story.created_at ? story.updated_at : '_')
        .replace(/%a/, story.archived)
    );
    return story;
};};

const parseDateComparator = (arg) => {
    const match = arg.match(/[0-9].*/) || { index: 0, '0': { length: 30 } };
    const parsedDate = new Date(arg.slice(match.index));
    const comparator = arg.slice(0, match.index);
    return (date) => {
        switch(comparator) {
        case '<':
            return new Date(date) < parsedDate;
        case '>':
            return new Date(date) > parsedDate;
        case '=':
        default:
            return new Date(date.slice(0, match[0].length)).getTime()
                == parsedDate.getTime();
        }
    };
};


module.exports = {
    listStories,
    printStory,
};
