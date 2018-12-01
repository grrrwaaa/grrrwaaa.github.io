#!/usr/bin/env luajit

--[[

Static site generator (again)

Inspired: http://docpad.org/docs/overview

Structure

/out (the rendered files)
/src 

Asset pipeline:

hello.html.md.lua means parse as lua, then parse as md, then render finally as html.

--]]

-- allow loading modules from ./modules:
package.path = "./modules/?.lua;./modules/?/init.lua;" .. package.path
package.cpath = "./modules/?.so" .. package.cpath

local fs = require "fs"
local sys = require "sys"
local kqueue = require "kqueue"
local md = require "md"
local lustache = require "lustache"
local template = require "template"

local concat = table.concat
local format = string.format

-- run shell commands:
local function cmd(fmt, ...) 
	local str = format(fmt, ...)
	--print(str) 
	return io.popen(str):read("*a") 
end

local function cmdi(fmt, ...)
	local str = format(fmt, ...)
	--print(str) 
	return io.popen(str):lines()
end

-- time is optional, defaults to current time
local function html5date(time)
	return os.date("%F", time)
end

local function html5timezone()
	local timezone = os.date("%z")
	return format("%s:%s", timezone:sub(1, 3), timezone:sub(4))
end

local function html5datetime(time)
	if time then
		return os.date("%FT%T", time)
	end
	return os.date("%FT%T")..html5timezone()
end

--print(html5datetime())
--print(html5datetime(os.time{ year=2013, month=11, day=25, hour=20, min=23, sec=46 }))


-- parse arguments
arg = arg or { ... }
for i, a in ipairs(arg) do
	if a:sub(1, 1) == "-" then
		print("option", a, i)
	else
		print("argument", a, i)
	end
	arg[a] = true
end

-- get or create config:
local ok, config = pcall(require, "config")
if not ok then 
	-- or write & then require this file?
	config = {} 
end
config.out = config.out or "out/"
config.src = config.src or "src/"
config.documents = config.documents or "documents/"
config.templates = config.templates or "templates/"

-- model is a Lua-table database of site information
local model = require "model"

local watched = {}
local templates = {}
local kq = kqueue.new()

-- simple concatenation of function:
local function job_chain(a, b)
	if a and b then
		return function(...) return b(a(...)) end
	else
		return a or b
	end
end

function watch(filename, handler)
	if not watched[filename] then
		handler()
	end
	watched[filename] = handler
	
	local w = kqueue.watch(kq, filename, function(w)
		print("modified:", w.filename, w.fd)
		handler()
	end)
end



-- parse all documents:
local documents_path = config.src .. config.documents
local templates_path = config.src .. config.templates

fs.iter(templates_path, function(subpath, name)
	local subpath_str = concat(subpath, fs.sep) .. fs.sep 
	local ext, outname = fs.ext(name)	
	local full_watched_path = templates_path .. fs.sep 
					.. subpath_str
					.. outname .. "." .. ext
	
	local src = io.open(full_watched_path):read("*a")
	
	templates[outname] = src
	
	--print("read", outname, src)
end)

fs.iter(documents_path, function(subpath, name)
	
	local subpath_str = concat(subpath, fs.sep) .. fs.sep 
	local ext, outname = fs.ext(name)	
	local full_watched_path = documents_path .. fs.sep 
					.. subpath_str
					.. outname .. "." .. ext
	
	-- initial handler reads the contents:
	-- (assumes text formatted files only)
	local handler = function()
		return io.open(full_watched_path):read("*a")
	end
	
	-- chaining translation jobs according to the extensions:
	local ext1, outname1 = fs.ext(outname)
	while ext1 do
	
		local render
		if ext == "lua" then
			-- what should we pass in as model?
			render = function(src) return loadstring(src)(model) end
		elseif ext == "md" then
			render = md
		elseif ext == "ta" then	
			-- what is model?
			render = function(src)
				local s = lustache:render(src, model)
				--print(s)
				return s
			end
		else
			error("unexpected ext" .. ext)
		end
	
		handler = job_chain(handler, render)
	
		ext, outname = ext1, outname1
		ext1, outname1 = fs.ext(outname)
	end
	
	-- now create install rule:
	local full_dst_path = config.out .. fs.sep 
							.. subpath_str
							.. outname .. "." .. ext
	
	handler = job_chain(handler, function(src)
	
		-- now pipe it through the template:
		local t = templates.default
		if t then
			src = lustache:render(t, {
				content = src
			})
		end	
		print("writing", full_dst_path)
		--print(src)
		local f = io.open(full_dst_path, "w")
		f:write(src)
		f:close()
		return src
	end)
	
	local ok, err = pcall(watch, full_watched_path, handler)
	if not ok then print(err) end
end, true)

print("now watching for changes")
kqueue.start(kq)
