// Parameters
// TODO: allow these to be specified with options, eg with commander
const src_htmlfile = "index.html";
const template_htmlfile = "testing/template.html";
const ts_htmlfile = "testing/testspec.html";
const ea_htmlfile = "testing/extra-assertions.html";
const plan_htmlfile = "testing/plan.html";

// Dependencies
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const csvtojson=require('csvtojson'); // V2

// Read in test specs and store as a map
const ts_raw = fs.readFileSync(ts_htmlfile, 'UTF-8');
var ts_dom = cheerio.load(ts_raw);
var testspec = {};
ts_dom('span[class="testspec"]').each(function(i,elem) {
    let id = ts_dom(this).attr('id');
    if (undefined === id) {
        console.log("Warning: testspec without id:\n",ts_dom(this).html());
    } else {
        // console.log("Adding testspec for",id,":\n",ts_dom(this).html());
        testspec[id] = ts_dom(this);
    }
});
// console.log("test specs:",ts_dom.html());

// Initialize plan dom with template
const template_raw = fs.readFileSync(template_htmlfile, 'UTF-8');
var plan_dom = cheerio.load(template_raw);

// Read in index.html store as a dom
const src_raw = fs.readFileSync(src_htmlfile, 'UTF-8');
var src_dom = cheerio.load(src_raw);
var src_title = src_dom('title').text();

// Extract assertions
var assertions = {};
src_dom('span[class="rfc2119-assertion"]').each(function(i,elem) {
    let id = src_dom(this).attr('id');
    if (undefined === id) {
        console.log("WARNING: rfc2119-assertion without id:",
                    src_dom(this).html());
    } else {
        assertions[id] = src_dom(this);
    }
});

// Get all results, convert from CSV to JSON
const results_dir = path.join(__dirname, 'testing', 'results');
var results = new Map();
var results_files = fs.readdirSync(results_dir);
function get_results(i,done_callback) {
    var file = path.join(results_dir, results_files[i]);
    if (file.match(/.csv$/g)) {
        console.log("processing results in",file);
        var basename = path.basename(file,'.csv');
        var filedata = fs.readFileSync(file).toString();
        csvtojson()
            .fromString(filedata)
            .then((data)=> {
                results.set(basename,data);
                if (results_files.length - 1 == i) {
                    done_callback(results);
                } else {
                    get_results(i+1,done_callback);
                }
            })
    } else {
        if (results_files.length - 1 == i) {
            done_callback(results);
        } else {
            get_results(i+1,done_callback);
        }
    }
}
var merged_results = new Map();
function cleanInt(x) {
   x = Number(x);
   return x >= 0 ? Math.floor(x) : Math.ceil(x);
}
function merge_results(done_callback) {
    for (let [impl,data] of results.entries()) {
        for (let i=0; i<data.length; i++) {
           let id = data[i]["ID"];
           let pass = data[i]["Pass"];
           let current_pass = merged_results.get(id);
           if (undefined != current_pass) {
               merged_results.set(id,current_pass + cleanInt(pass));
           } else {
               merged_results.set(id,cleanInt(pass));
           }
        }
    }
    done_callback(merged_results);
}

// Clear (well, write headers for) results template
var results_template = path.join(results_dir,'template.csv');
fs.writeFileSync(results_template,'"ID","Pass"\n');

// Merge assertions and test specs into plan
plan_dom('head>title').append(src_title);
// plan_dom('body>h2').append(src_title);
// plan_dom('body').append('<dl></dl>');
function merge_assertions(done_callback) {
  for (a in assertions) {
    console.log("Processing assertion "+a);

    // Results template
    fs.appendFileSync(results_template, '"'+a+'",0\n');

    // Appendix
    plan_dom('#testspecs').append('<dt></dt>');
    let plan_dt = plan_dom('#testspecs>dt:last-child');
    plan_dt.append('<a href="../index.html#'+a+'">'+a+'</a>');

    let category = undefined;
    if (assertions[a].text().indexOf('MUST') > -1) {
        if (assertions[a].text().indexOf('MUST NOT') > -1) {
            category = 'MUST NOT';
        } else {
            category = 'MUST';
        }
    }
    if (assertions[a].text().indexOf('SHOULD') > -1) {
        if (assertions[a].text().indexOf('SHOULD NOT') > -1) {
            category = 'SHOULD NOT';
        } else {
            category = 'SHOULD';
        }
    }
    if (assertions[a].text().indexOf('MAY') > -1) {
        category = 'MAY';
    }
    if (assertions[a].text().indexOf('REQUIRED') > -1) {
        category = 'REQUIRED';
    }
    if (assertions[a].text().indexOf('RECOMMENDED') > -1) {
        category = 'RECOMMENDED';
    }
    if (assertions[a].text().indexOf('OPTIONAL') > -1) {
        category = 'OPTIONAL';
    }

    if (undefined === category) {
        console.log("  WARNING: RFC2119 category is not defined");
        plan_dt.append(': <strong>'+'undefined'+'</strong>');
    } else {
        plan_dt.append(': <strong>'+category+'</strong>');
    }

    // retreive text of assertion
    a_text = assertions[a];

    // Table
    plan_dom('#testresults').append('<tr class="'+a+'"></tr>');
    let plan_tr = plan_dom('tr.'+a);
    plan_tr.append('<td><a href="../index.html#'+a+'">'+a+'</a></td>');
    plan_tr.append('<td>'+a_text+'</td>');
    plan_tr.append('<td></td>');
    plan_tr.append('<td></td>');
    let pass_count = merged_results.get(a);
    if (undefined != pass_count) {
       plan_tr.append('<td>'+pass_count+'</td>');
    } else {
       plan_tr.append('<td></td>');
    }
    plan_tr.append('<td></td>');
    plan_tr.append('<td></td>');

    // Add to appendix
    plan_dom('#testspecs').append('<dd class="'+a+'"></dd>');
    let plan_dd = plan_dom('dd.'+a);
    plan_dd.append(a_text);
    a_spec = testspec[a];
    plan_dd.append('<br/><span></span>');
    let plan_li = plan_dom('dd.'+a+'>span:last-child');
    if (undefined === a_spec) {
        console.log("  WARNING: no test spec");
        plan_li.append('<p><strong>NO TEST SPECIFICATION</strong></p>');
    } else {
        plan_li.append(a_spec);
    }
  }
  done_callback();
}

get_results(0,function(results) {
/*
    console.log("Results: {\n");
    for (let [key,data] of results.entries()) {
        console.log(key," => ",data);
    }
    console.log("}");
*/
    merge_results(function(merged_results) {
/*
      console.log("Merged Results: {\n");
      for (let [key,data] of merged_results.entries()) {
        console.log(key," => ",data);
      }
      console.log("}");
*/
      merge_assertions(function() {
        // Output plan
        fs.writeFile(plan_htmlfile, plan_dom.html(), function(error) {
            if (error) {
                return console.log(err);
            } else {
                console.log("Test plan output to "+plan_htmlfile);
            }
        }); 
      }); 
    });
});

