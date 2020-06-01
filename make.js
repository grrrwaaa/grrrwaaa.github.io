#!/usr/bin/env node

const fs = require("fs"),
	path = require("path"),
	assert = require("assert")

const showdown = require("showdown");	
const cheerio = require('cheerio');

let src = fs.readFileSync("index.html", "utf-8");

// create a backup:

fs.writeFileSync("index_backup.html", src, "utf-8");

const $ = cheerio.load(src);

var converter = new showdown.Converter({
	ghCompatibleHeaderId: true,
	literalMidWordUnderscores: true,
});

var written = [];
function write() {
	written.push(Array.prototype.slice.call(arguments).join(""));
}

write("<!-- BEGIN GENERATED CONTENT HERE -->");

// find & process the markdown content:
$(".tab-source").each(function() {
	let src_id = $(this).attr("id");
	let id = src_id.substring(0, src_id.length-9)
	let text = $(this).html();
	console.log(src_id, id, text)

	let html = converter.makeHtml(text);
	write("<!-- " + id + " -->");
	write('<section class="tab-view" id="'+id+'">');
	write(html);
	write('</section>');
	write("<!-- end of " + id + " -->");
	
	// let section = $(this);
	// section.html(html);
});

write("<!-- END GENERATED CONTENT HERE -->");

$("#main_generated_content").html(written.join("\n"));

fs.writeFileSync("index.html", $.html(), "utf-8");
