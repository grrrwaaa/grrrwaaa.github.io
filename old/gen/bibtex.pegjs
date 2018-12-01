/*	
	This file uses the Parsing Expression Grammar formalism (PEG), 
	as implemented in [pegjs](http://pegjs.org/documentation).
	(For reference, [here's ES5 in pegjs](https://github.com/pegjs/pegjs/blob/master/examples/javascript.pegjs))
	
	The **grammar** is a list of named rules, beginning with "start"
	
	Each **rule** is defined as a pattern, optionally followed by an action (in braces)
	
	**Patterns** can use quoted strings, other rule names, and some operators
	E.g. (x)? makes x optional, (x)* matches zero or more, (x)+ matches 1 or more, (a / b) matches either a or b, [0-9] matches any digit, etc.
	Matches can be named, e.g. arg:expression matches the rule expression and names its result "arg"
	
	**Actions** are blocks of JavaScript code that will be run when a rule matches, with named arguments available as locals. In addition, the block of js code at the head of this document is also available, and a few other handy methods, such as text() for the original input.
*/

{
	/*
		PEG.js lets us define some helper functions in the header 
		(for use in rule actions)
	*/

	var specials = {
		'"': "uml",
		"'": "acute",
		"\\": "slash",
	};
	
	var monthNames = ["January", "February", "March", "April", "May", "June",
  		"July", "August", "September", "October", "November", "December"
	];
	
	function getMonthFromString(mon){
   		return new Date(Date.parse(mon +" 1, 2012")).getMonth()+1
	}

}

///////////////////// START RULE /////////////////////

start = item*

_ "whitespace" = (comment / newline / [ \t])*
	
newline = [\n\r\u2028\u2029]

comment = "%" [^\n\r]* EOL

EOL = [\n\r]{1,2} / !.

name "name" = letters:[-a-zA-Z0-9]+ { return letters.join(""); }
  
item = _ "@" entryType:name _ "{" _ id:name _ "," _ attributes:attribute* _ "}" _ {
	var result = {};
	for (var kv of attributes) {
		result[kv[0].toUpperCase()] = kv[1];
	}
	result.entryType = entryType.toUpperCase();
	result.ID = id;
	return  result;
}

attribute = comment / author_attribute / month_attribute / year_attribute / generic_attribute

author_attribute = key:("Author"i / "Editor"i) _ "=" _ value:authorlist _ ","? _ {
	return [ key, value ];
}

authorlist = authors:blockstring {
	authors = authors.split(" and ");
	for (var i in authors) {
		var author = authors[i];
		var names = author.split(",");
		if (names.length > 1) {
			author = names.reverse().join(" ").trim();
		}
		names = author.split(" ");
		authors[i] = {
			last: names.pop(),
			first: names,
		};
	}
	return authors;
}

month_attribute = key:"Month"i _ "=" _ "{" _ value:name _ "}" _ ","? _ {
	var month = getMonthFromString(value);
	return [key, {
		month: month,
		name: monthNames[month]
	}];
}

year_attribute = key:"Year"i _ "=" _ "{" _ value:([0-9]+) _ "}" _ ","? _ {
	return [key, +(value.join(""))];
}

generic_attribute = key:name _ "=" _ value:value _ ","? _ {
	return [ key, value ];
}

value = blockstring

specialchar = 
	"--" { return "-"; }
	/ "\"" { return '"'; }
	/ "\\&" { return "&amp;" }
	/ "{" "\\" "o}" { return "&oslash"; }
	/ "\\" type:("'" / '"') "{" char:[a-z] "}" { 
		return "&" + char + specials[type] + ";" 
	}

fancyquote = "``" { return '"'; }
	/  "''" { return '"'; }

blockchar = input:(fancyquote / specialchar / blockquoted / [^"}"]) 

blockquoted = "{" blockchar+ "}"

blockstring = "{" body:blockchar* "}" { return body.join(""); }