#!/usr/bin/env iojs
/*
	Build with io.js
	
	The 'database' is just a big javascript object, cobbled together from some JSON files and a few other processes (such as parsing a bibtex .bib into JS objects). This database is massaged into a model for template insertion.
	
	The pages are markdown with embedded moustache for inserting the data.
	
	Each page is htmlified and squirted into a page template, also moustached.
	
	So why not just Jade?
	
	*.json + stuff => model
	cv.md + model => cv_model
	page.html + cv_model => cv.html
	
*/

"use strict"

let config = {
	data: "../dat/",
	pages: "../dat/pages/",
	output: "../",
}

let fs = require('fs');
let path = require('path');
let PEG = require("pegjs");
let Mustache = require("mustache");
let showdown = require("showdown");

let csvParser = PEG.generate(`

csv
  = [\\n\\r]* first:line rest:([\\n\\r]+ data:line { return data; })* [\\n\\r]* { rest.unshift(first); return rest; }

line
  = first:field rest:(char:. & { return char == ","; } text:field { return text; })*
    & { return !!first || rest.length; }
    { rest.unshift(first); return rest; }

field
  = '"' text:char* '"' { return text.join(''); }
  / text:(char:[^\\n\\r] & { return char != ","; } { return char; })*
    { return text.join(''); }

char
  = '"' '"' { return '"'; }
  / [^"]
`);

// takes a path to a .csv file
// returns an array of objects, one for each csv row
function csvToDictionary(path) {
	let csv = csvParser.parse(fs.readFileSync(path, "utf-8"));
	let headings = csv.shift();
	let result = [];
	for (let r in csv) {
		let row = csv[r];
		let out = {};
		for (let h in headings) {
			out[ headings[h] ] = row[h];
		}
		result.push(out);
	}
	return result;
}	

let publications = csvToDictionary(config.data + "cvdat - publications.csv");
//console.log(publications);

// https://github.com/showdownjs/showdown
let showdown_options = {
	omitExtraWLInCodeBlocks: true,
	parseImgDimensions: true,
	// headerLevelStart: 1,
	// simplifiedAutoLink: false,
	literalMidWordUnderscores: true,
};
let html_converter = new showdown.Converter(showdown_options);

function sort_by_date(a, b) {
	var ad = a.date_end ? a.date_end : a.date;
	var bd = b.date_end ? b.date_end : b.date;
	return new Date(bd) - new Date(ad);
}

// assumes absence of date_end means "present day"
function sort_by_date_topresent(a, b) {
	var ad = a.date_end ? a.date_end : new Date();
	var bd = b.date_end ? b.date_end : new Date();
	return new Date(bd) - new Date(ad);
}

let monthnames = [
	"January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"
];

let model = {
	cv: {
		artworks: JSON.parse(fs.readFileSync(config.data + "artworks.json", "utf-8")),
		employment: JSON.parse(fs.readFileSync(config.data + "employment.json", "utf-8")),
		service: JSON.parse(fs.readFileSync(config.data + "service.json", "utf-8")),
		presentations: JSON.parse(fs.readFileSync(config.data + "presentations.json", "utf-8")),
		funding: JSON.parse(fs.readFileSync(config.data + "funding.json", "utf-8")),
		teaching: JSON.parse(fs.readFileSync(config.data + "teaching.json", "utf-8")),
		publications: JSON.parse(fs.readFileSync(config.data + "publications.json", "utf-8"))
	}
}

// replace the publications section:
{
	/*
	let bib = fs.readFileSync(config.data + "pubs.bib", "utf-8");
	let bibgrammar = fs.readFileSync("bibtex.pegjs", "utf-8");

	let options = {
		// output: "source", // output the parser as a js module instead
		// optimize: "size",	// slows it down though
		cache: true,		// avoids pathological slowdowns
		//allowedStartRules: [ "start", "expression" ]
	}

	let parser = PEG.buildParser(bibgrammar, options);
	let pubs = parser.parse(bib);
	*/
	
	let pubs = model.cv.publications;
	
	function authorlist(src, lim) {
		var res = [];
		if (src.length > lim) {
			var name = src[0].first + " " + src[0].last;
			return name + " et al.";
		} else {
			for (var i in src) {
				var name = src[i].first + " " + src[i].last;
				res.push(name);
			}
			return res.join(", ");
		}
	}
	
	// some in-place modifications:
	for (var i in pubs) {
		var pub = pubs[i];
		if (pub.author) pub.generated_authorlist = authorlist(pub.author, 10);
		if (pub.editor) pub.generated_editorlist = authorlist(pub.editor, 4);	
		if (pub.month) pub.generated_monthname = monthnames[pub.month-1];
	}
	
	// now sort:
	pubs.sort(function(a, b) {
		if (a.status !== undefined && b.status === undefined) return -1;
		if (b.status !== undefined && a.status === undefined) return  1;
		if (a.year == b.year) {
			if (a.month == b.month || (a.month == undefined && b.month == undefined)) {
				if (a.bibtex_entrytype != b.bibtex_entrytype) {
					return a.bibtex_entrytype > b.bibtex_entrytype ? 1 : -1;
				}
				return a.title > b.title ? 1 : -1;
			} 
			return b.month > a.month ? 1 : -1;
		}
		return b.year > a.year ? 1 : -1;
	});
	
	model.cv.publications = pubs;
	
	// save it back:
	fs.writeFileSync(config.data + "publications.json", JSON.stringify(pubs, null, 2));
}

// cache a copy?
if (true) {
	console.log("updating model.json");
	let jsonified = JSON.stringify(model, null, 2);
	fs.writeFileSync(config.data + "model.json", jsonified);
}

// now extend the model with a few additional helpers:
{
	// generate view.exhibitions from view.artworks:
	var ex = [];
	for (var i in model.cv.artworks) {
		var artwork = model.cv.artworks[i];
		if (artwork.artist.indexOf("Wakefield") > 0) {
			for (var j in artwork.events) {
				var event = artwork.events[j];
			
				// copy tags from parent:
				for(var k in artwork) {
					if (k != "events" && !event[k]) {
						event[k]=artwork[k];
					}
				}
			
				ex.push(event);
			}
		}
	}
	
	ex.sort(sort_by_date);
	
	model.cv.exhibitions = ex;
	
	var bibitems = {};
	
	var showabstract = " {{#abstract}}<div id=\"{{bibtex_id}}\" class=\"bibabstract\"> {{{.}}} </div>{{/abstract}}"
	
	var authors = "{{{generated_authorlist}}}. ";
	var status = "{{#status}}**{{{.}}}:** {{/status}}";
	var title = "{{#URL}}[\"{{{title}}}.\"]({{.}}){{/URL}}{{^URL}}\"{{{title}}}.\"{{/URL}}"
	var annote = "{{#annote}} **{{{.}}}**{{/annote}}";
	var collectiontitle = "{{#journal}}*{{{.}}}* {{volume}}{{#number}}, no. {{.}}{{/number}} {{/journal}}";
	var editedby = "{{#generated_editorlist}}, edited by {{{.}}}{{/generated_editorlist}}";
	var monthyear = "{{#month}}{{generated_monthname}}, {{/month}}{{year}}";
	
	bibitems.inproceedings = status + authors + title + " In *{{booktitle}}* ({{venue}}){{#pages}}, {{.}}{{/pages}}. {{#publisher}}{{.}}, {{/publisher}}" + monthyear + "." + annote + showabstract;
	
	bibitems.incollection = status + authors + title + " In " + collectiontitle + "{{#booktitle}}*{{{.}}}*{{/booktitle}}{{#venue}} *({{{.}}})*{{/venue}}" + editedby + "{{#pages}}, {{.}}{{/pages}}. {{publisher}}{{#address}} {{address}}{{/address}}, " + monthyear + "." + annote + showabstract;
	
	bibitems.article = status + authors + title + " " + collectiontitle + editedby + " (" + monthyear + "){{#pages}}: {{.}}{{/pages}}. {{#publisher}}{{.}}.{{/publisher}}" + annote + showabstract;
	
	bibitems.mastersthesis = authors + title + " Masters thesis, {{school}}, " + monthyear + "." + annote + showabstract;
	bibitems.phdthesis = authors + title + " PhD dissertation, {{school}}, " + monthyear + "." + annote + showabstract;
	
	model.bibitem = function(value) {
		var tpl = bibitems[this.bibtex_entrytype];
		if (tpl) {
			return Mustache.render(tpl, this);
		} else {
			return "No template found for entryType " + this.entryType;
		}
	}
}	

// more sorting:
{
	model.cv.employment.sort(sort_by_date_topresent);
	model.cv.funding.sort(function (a, b) {
		if (a.date != b.date) return new Date(b.date) - new Date(a.date);
		if (a.inreview != b.inreview) return b.inreview ? 1 : -1;
		return 0;
	});
}

let root = {
	
	pages: [],
};

// make a demo file:
{
	let template = fs.readFileSync(config.pages + "cv.md", "utf-8");
	// is there a way to parse this to find the headings, to create a submenu?
	
	let markdown_rendered = Mustache.render(template, model);
	
	// store this, because we'll need it for the menu generation etc.
	root.pages.push({
		filename: config.output + "cv.html",
		title: "Graham Wakefield",
		content: html_converter.makeHtml(markdown_rendered),
	});
}	

// finally render the pages:
for (let i in root.pages) {
	let page_model = root.pages[i];
	
	let page_template = fs.readFileSync(config.data + "page.html", "utf-8");
	let page_rendered = Mustache.render(page_template, page_model);
	fs.writeFileSync(page_model.filename, page_rendered);
}

// pull in the pubs data from the Google sheets CSV:
// https://docs.google.com/spreadsheets/d/1XIWlbGwwFRxwUoeESbHsprt9ouz-mtfnvYJgpfDGZJY

